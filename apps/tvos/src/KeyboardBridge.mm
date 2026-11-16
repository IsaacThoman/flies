// Typing on the Apple TV: an alert with a text field, presented over the game on the main thread,
// with tvOS's full-screen keyboard brought up for it at once. The game's frames go on under it,
// but the remote is the keyboard's while it is up (Remote.muted). The answer is handed to the
// JavaScript thread, which asked.
#import "KeyboardBridge.h"
#import "JSHost.h"
#import "Remote.h"
#import <UIKit/UIKit.h>

/** One question: its alert, the game's callback (protected until it is answered), whether its
 *  alert has finished coming up, and what to do once it is down again. Main thread. */
@interface FlyQuestion : NSObject
@property(nonatomic, strong) UIAlertController *alert;
@property(nonatomic) JSValueRef done;
@property(nonatomic) BOOL shown;
@property(nonatomic, copy) void (^afterDown)(void);
@end
@implementation FlyQuestion
@end

namespace {
/** How long an unattended run leaves the keyboard up before answering: long enough to be seen, and pressed at. */
constexpr double kTypedAfterSeconds = 1.5;

// Main thread.
FlyQuestion *gQuestion;
NSMutableArray *gTyped;

NSString *ToNS(JSContextRef ctx, JSValueRef v) {
  JSStringRef s = JSValueToStringCopy(ctx, v, nullptr);
  if (!s) return @"";
  NSString *r = (__bridge_transfer NSString *)JSStringCopyCFString(kCFAllocatorDefault, s);
  JSStringRelease(s);
  return r;
}

UIViewController *GameController() {
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) if (window.isKeyWindow) return window.rootViewController;
  }
  return nil;
}

/** An answered question's alert taken down, if it is still up, then whatever waits on it. */
void TakeDown(FlyQuestion *q) {
  void (^after)(void) = q.afterDown;
  q.afterDown = nil;
  UIViewController *presenter = q.alert.presentingViewController;
  if (presenter) [presenter dismissViewControllerAnimated:YES completion:after];
  else if (after) after();
}

/** Answers a question still waiting (null for `text` nil). Its alert comes down as soon as it is
 *  fully up, unless the alert's own buttons answered, which take it down themselves. */
void Answer(FlyQuestion *q, NSString *text, BOOL byAlert) {
  if (q != gQuestion) return;
  gQuestion = nil;
  // A question waiting to come up next keeps the remote the keyboard's in between.
  if (!q.afterDown) CurrentHost().remote.muted = NO;
  JSValueRef done = q.done;
  [CurrentHost() perform:^(JSGlobalContextRef ctx) {
    JSValueRef arg = text ? JSStringValue(ctx, text) : JSValueMakeNull(ctx);
    [CurrentHost() call:(JSObjectRef)done args:&arg count:1];
    JSValueUnprotect(ctx, done);
  }];
  if (byAlert) {
    void (^after)(void) = q.afterDown;
    q.afterDown = nil;
    if (after) after();
  } else if (q.shown) TakeDown(q);
}

void Present(FlyQuestion *q, NSString *title, NSString *value, NSString *kind) {
  UIAlertController *alert = [UIAlertController alertControllerWithTitle:title message:nil preferredStyle:UIAlertControllerStyleAlert];
  [alert addTextFieldWithConfigurationHandler:^(UITextField *field) {
    field.text = value;
    // What the field is, shown over the keyboard while nothing is typed.
    field.placeholder = title;
    field.returnKeyType = UIReturnKeyDone;
    if ([kind isEqualToString:@"password"] || [kind isEqualToString:@"new-password"]) {
      field.secureTextEntry = YES;
      field.textContentType = [kind isEqualToString:@"password"] ? UITextContentTypePassword : UITextContentTypeNewPassword;
    } else if ([kind isEqualToString:@"name"]) {
      field.autocapitalizationType = UITextAutocapitalizationTypeWords;
      field.textContentType = UITextContentTypeNickname;
    } else {
      // A table's code: letters and digits, exactly as typed.
      field.keyboardType = UIKeyboardTypeASCIICapable;
      field.autocapitalizationType = UITextAutocapitalizationTypeNone;
      field.autocorrectionType = UITextAutocorrectionTypeNo;
      field.spellCheckingType = UITextSpellCheckingTypeNo;
      field.smartDashesType = UITextSmartDashesTypeNo;
      field.smartQuotesType = UITextSmartQuotesTypeNo;
    }
  }];
  __weak FlyQuestion *weak = q;
  [alert addAction:[UIAlertAction actionWithTitle:@"OK" style:UIAlertActionStyleDefault handler:^(UIAlertAction *) {
    FlyQuestion *question = weak;
    if (question) Answer(question, question.alert.textFields.firstObject.text ?: @"", YES);
  }]];
  [alert addAction:[UIAlertAction actionWithTitle:@"Cancel" style:UIAlertActionStyleCancel handler:^(UIAlertAction *) {
    FlyQuestion *question = weak;
    if (question) Answer(question, nil, YES);
  }]];
  q.alert = alert;
  gQuestion = q;
  CurrentHost().remote.muted = YES;
  UIViewController *game = GameController();
  if (!game) {
    Answer(q, nil, YES);
    return;
  }
  [game presentViewController:alert animated:YES completion:^{
    q.shown = YES;
    // Answered while it was coming up (another question came): down again.
    if (q != gQuestion) {
      TakeDown(q);
      return;
    }
    [alert.textFields.firstObject becomeFirstResponder];
    if (!gTyped.count) return;
    id typed = gTyped.firstObject;
    [gTyped removeObjectAtIndex:0];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kTypedAfterSeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      if (q != gQuestion) return;
      NSString *text = [typed isKindOfClass:NSString.class] ? typed : nil;
      alert.textFields.firstObject.text = text;
      HostLog(0, [NSString stringWithFormat:@"keyboard: typed %@", text ? @"an answer and confirmed it" : @"nothing and went back"]);
      Answer(q, text, NO);
    });
  }];
}

JSValueRef K_ask(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef *) {
  if (argc < 4 || !JSValueIsObject(ctx, argv[3])) return JSValueMakeUndefined(ctx);
  NSString *title = ToNS(ctx, argv[0]), *value = ToNS(ctx, argv[1]), *kind = ToNS(ctx, argv[2]);
  JSValueRef done = argv[3];
  JSValueProtect(ctx, done);
  dispatch_async(dispatch_get_main_queue(), ^{
    FlyQuestion *q = [FlyQuestion new];
    q.done = done;
    // One question at a time: a new one answers the last with null, and comes up once that one's alert is down.
    FlyQuestion *last = gQuestion;
    if (!last) {
      Present(q, title, value, kind);
      return;
    }
    last.afterDown = ^{ Present(q, title, value, kind); };
    Answer(last, nil, NO);
  });
  return JSValueMakeUndefined(ctx);
}
// The game has stopped typing (it left the field): the keyboard goes, answering null.
JSValueRef K_close(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t, const JSValueRef[], JSValueRef *) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (gQuestion) Answer(gQuestion, nil, NO);
  });
  return JSValueMakeUndefined(ctx);
}
}  // namespace

JSObjectRef MakeKeyboardBridge(JSContextRef ctx, NSArray *typed) {
  NSMutableArray *answers = [typed isKindOfClass:NSArray.class] ? [typed mutableCopy] : [NSMutableArray array];
  dispatch_async(dispatch_get_main_queue(), ^{ gTyped = answers; });
  JSObjectRef bridge = JSObjectMake(ctx, nullptr, nullptr);
  struct { const char *name; JSObjectCallAsFunctionCallback fn; } fns[] = { { "ask", K_ask }, { "close", K_close } };
  for (auto &f : fns) {
    JSStringRef s = JSStringCreateWithUTF8CString(f.name);
    JSObjectSetProperty(ctx, bridge, s, JSObjectMakeFunctionWithCallback(ctx, s, f.fn), kJSPropertyAttributeReadOnly, nullptr);
    JSStringRelease(s);
  }
  return bridge;
}
