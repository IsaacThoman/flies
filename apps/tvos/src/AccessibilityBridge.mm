// UIKit owns VoiceOver; the game publishes semantics only when it is running.
#import <UIKit/UIKit.h>
#import "AccessibilityBridge.h"
#import "JSHost.h"

@interface FlyAccessElement : UIAccessibilityElement
@property(nonatomic, copy) void (^activate)(void);
@property(nonatomic, copy) void (^focused)(void);
@property(nonatomic, copy) void (^adjust)(int);
@end
@implementation FlyAccessElement
- (void)accessibilityElementDidBecomeFocused { if (self.focused) self.focused(); }
- (BOOL)accessibilityActivate { if (!self.activate) return NO; self.activate(); return YES; }
- (void)accessibilityIncrement { if (self.adjust) self.adjust(1); }
- (void)accessibilityDecrement { if (self.adjust) self.adjust(-1); }
@end

static JSObjectRef gReceive;
static NSMutableDictionary<NSString *, FlyAccessElement *> *gElements;
static NSString *gScreen;
static NSString *gStatus;

static NSString *AccessString(JSContextRef ctx, JSValueRef value) {
  JSStringRef string = JSValueToStringCopy(ctx, value, nullptr);
  NSString *result = (__bridge_transfer NSString *)JSStringCopyCFString(kCFAllocatorDefault, string);
  JSStringRelease(string);
  return result;
}

static UIView *AccessView() {
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows)
      if (window.isKeyWindow) return window.rootViewController.view;
  }
  return nil;
}

static void SendAccess(NSString *event, NSString *value) {
  [CurrentHost() perform:^(JSGlobalContextRef ctx) {
    if (!gReceive) return;
    JSStringRef e = JSStringCreateWithCFString((__bridge CFStringRef)event);
    JSStringRef v = JSStringCreateWithCFString((__bridge CFStringRef)value);
    JSValueRef args[] = { JSValueMakeString(ctx, e), JSValueMakeString(ctx, v) };
    [CurrentHost() call:gReceive args:args count:2];
    JSStringRelease(e); JSStringRelease(v);
  }];
}

static void Command(NSString *item, NSString *action, NSNumber *value) {
  NSMutableDictionary *command = [@{ @"id": item, @"action": action } mutableCopy];
  if (value) command[@"value"] = value;
  NSData *data = [NSJSONSerialization dataWithJSONObject:command options:0 error:nil];
  SendAccess(@"command", [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
}

static void Preferences() {
  BOOL enabled = UIAccessibilityIsVoiceOverRunning();
  if (!enabled) { AccessView().accessibilityElements = nil; gElements = nil; gScreen = nil; gStatus = nil; }
  SendAccess(@"enabled", enabled ? @"true" : @"false");
  SendAccess(@"motion", UIAccessibilityIsReduceMotionEnabled() ? @"true" : @"false");
}

static JSValueRef Connect(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t count, const JSValueRef args[], JSValueRef *) {
  if (count < 1 || !JSValueIsObject(ctx, args[0])) return JSValueMakeUndefined(ctx);
  if (gReceive) JSValueUnprotect(ctx, gReceive);
  gReceive = JSValueToObject(ctx, args[0], nullptr);
  JSValueProtect(ctx, gReceive);
  dispatch_async(dispatch_get_main_queue(), ^{
    static dispatch_once_t once;
    dispatch_once(&once, ^{
      for (NSNotificationName name in @[ UIAccessibilityVoiceOverStatusDidChangeNotification, UIAccessibilityReduceMotionStatusDidChangeNotification ])
        [NSNotificationCenter.defaultCenter addObserverForName:name object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *) { Preferences(); }];
    });
    Preferences();
  });
  return JSValueMakeUndefined(ctx);
}

static JSValueRef Publish(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t count, const JSValueRef args[], JSValueRef *) {
  if (count < 1) return JSValueMakeUndefined(ctx);
  NSString *json = AccessString(ctx, args[0]);
  NSDictionary *state = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
  if (![state isKindOfClass:NSDictionary.class]) return JSValueMakeUndefined(ctx);
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!UIAccessibilityIsVoiceOverRunning()) return;
    UIView *view = AccessView();
    if (!view) return;
    BOOL changed = ![gScreen isEqual:state[@"key"]];
    if (changed || !gElements) gElements = [NSMutableDictionary new];
    gScreen = state[@"key"];
    NSMutableArray *elements = [NSMutableArray new];
    NSMutableSet *ids = [NSMutableSet new];
    NSUInteger row = 0;
    for (NSDictionary *item in state[@"items"]) {
      NSString *itemId = item[@"id"];
      [ids addObject:itemId];
      FlyAccessElement *element = gElements[itemId];
      if (!element) { element = [[FlyAccessElement alloc] initWithAccessibilityContainer:view]; gElements[itemId] = element; }
      element.accessibilityLabel = item[@"name"];
      element.accessibilityTraits = UIAccessibilityTraitButton;
      BOOL disabled = [item[@"disabled"] boolValue];
      if (disabled) element.accessibilityTraits |= UIAccessibilityTraitNotEnabled;
      NSString *kind = item[@"kind"];
      BOOL choice = [kind isEqual:@"choice"];
      BOOL slider = [kind isEqual:@"slider"];
      id value = item[@"value"];
      NSArray *options = item[@"options"];
      NSInteger index = [value respondsToSelector:@selector(integerValue)] ? [value integerValue] : 0;
      element.accessibilityValue = choice && index >= 0 && index < (NSInteger)options.count ? options[index] : value ? [value description] : nil;
      element.focused = ^{ Command(itemId, @"focus", nil); };
      element.activate = nil;
      if (!disabled) element.activate = ^{ Command(itemId, @"activate", nil); };
      element.adjust = nil;
      if (choice || slider) {
        element.accessibilityTraits |= UIAccessibilityTraitAdjustable;
        if (!disabled) element.adjust = ^(int direction) {
          double low = choice ? 0 : [item[@"min"] doubleValue];
          double high = choice ? (double)options.count - 1 : [item[@"max"] doubleValue];
          double step = choice ? 1 : [item[@"step"] doubleValue];
          double next = fmax(low, fmin(high, [value doubleValue] + direction * step));
          Command(itemId, @"value", @(next));
        };
      }
      // A stable reading order across the full screen; no UIKit view is drawn.
      CGFloat height = MIN(64, view.bounds.size.height / MAX(1, [state[@"items"] count]));
      element.accessibilityFrameInContainerSpace = CGRectMake(20, row++ * height, view.bounds.size.width - 40, height);
      [elements addObject:element];
    }
    for (NSString *itemId in gElements.allKeys) if (![ids containsObject:itemId]) [gElements removeObjectForKey:itemId];
    view.accessibilityElements = elements;
    if (changed) UIAccessibilityPostNotification(UIAccessibilityScreenChangedNotification, gElements[state[@"focus"]] ?: elements.firstObject);
    NSString *status = state[@"status"];
    if (status.length && ![status isEqual:gStatus]) UIAccessibilityPostNotification(UIAccessibilityAnnouncementNotification, status);
    gStatus = status;
  });
  return JSValueMakeUndefined(ctx);
}

JSObjectRef MakeAccessibilityBridge(JSGlobalContextRef ctx) {
  JSObjectRef bridge = JSObjectMake(ctx, nullptr, nullptr);
  for (const auto &entry : { std::pair<const char *, JSObjectCallAsFunctionCallback>{ "connect", Connect }, { "publish", Publish } }) {
    JSStringRef name = JSStringCreateWithUTF8CString(entry.first);
    JSObjectSetProperty(ctx, bridge, name, JSObjectMakeFunctionWithCallback(ctx, name, entry.second), kJSPropertyAttributeNone, nullptr);
    JSStringRelease(name);
  }
  return bridge;
}
