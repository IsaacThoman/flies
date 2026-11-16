// Flies for Apple TV on JavaScriptCore and OpenGL ES: public APIs only. See
// docs/apple-tv.md.
//
// The game's own JavaScript runs in JavaScriptCore (JSHost) with a small browser runtime
// (../runtime/) whose WebGL 2 and 2D canvas calls become a command stream that the executor
// (Executor, Canvas2D) runs on OpenGL ES 3.0 and CoreGraphics. This file is the app around it:
// the scene, the layer frames are shown in, and the Siri Remote's presses and touches.
#import <UIKit/UIKit.h>
#import "JSHost.h"
#import "Remote.h"
#import "SocketBridge.h"

// The launch config: --config <json> on the command line, else www/config.json (written by
// scripts/tvos.ts build), which is what runs from the home screen.
static NSDictionary *LaunchConfig() {
  NSArray *args = NSProcessInfo.processInfo.arguments;
  NSUInteger i = [args indexOfObject:@"--config"];
  NSString *json = i != NSNotFound && i + 1 < args.count ? args[i + 1] : nil;
  if (!json) json = [NSString stringWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"www/config" ofType:@"json"] encoding:NSUTF8StringEncoding error:nil];
  NSDictionary *config = json ? [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
  return [config isKindOfClass:NSDictionary.class] ? config : @{ @"script": @"game.js" };
}

@interface GameViewController : UIViewController
@property(nonatomic, strong) JSHost *host;
@property(nonatomic, strong) Remote *remote;
@property(nonatomic, strong) DisplayTarget *display;
@end

@implementation GameViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.blackColor;
  NSDictionary *config = LaunchConfig();
  // Keep unattended measurements free of the console debugger's overhead.
  if ([config[@"logFile"] boolValue]) {
    NSString *dir = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject;
    NSString *file = [dir stringByAppendingPathComponent:@"performance.log"];
    if (freopen(file.fileSystemRepresentation, "w", stderr)) setvbuf(stderr, nullptr, _IOLBF, 0);
  }
  CAEAGLLayer *layer = [CAEAGLLayer layer];
  layer.opaque = YES;
  layer.drawableProperties = @{ kEAGLDrawablePropertyRetainedBacking: @NO, kEAGLDrawablePropertyColorFormat: kEAGLColorFormatRGBA8 };
  [self.view.layer addSublayer:layer];
  self.display = [DisplayTarget new];
  self.display.layer = layer;
  self.display.screenSize = self.view.bounds.size;
  // The game's 640x480 frame is stretched over the 16:9 screen, nearest-neighbour by default.
  self.display.fill = ![config[@"fit"] isEqual:@"contain"];
  self.display.pixelated = config[@"pixelated"] ? [config[@"pixelated"] boolValue] : YES;
  [self.display layoutForCanvasWidth:640 height:480];

  // The launch image (UILaunchScreen) stays up while the game loads, then fades out.
  UIImageView *splash = [[UIImageView alloc] initWithImage:[UIImage imageNamed:@"Launch Image"]];
  splash.frame = self.view.bounds;
  splash.contentMode = UIViewContentModeScaleAspectFill;
  [self.view addSubview:splash];
  void (^hideSplash)(void) = ^{
    [UIView animateWithDuration:0.4 animations:^{ splash.alpha = 0; } completion:^(BOOL) { [splash removeFromSuperview]; }];
  };

  self.host = [[JSHost alloc] initWithConfig:config display:self.display];
  self.remote = [[Remote alloc] initWithHost:self.host];
  self.host.remote = self.remote;
  self.host.onReady = hideSplash;
  [self.host start];
  // A page that never says it's ready (a script error while loading) isn't hidden for good.
  __weak JSHost *host = self.host;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    void (^onReady)(void) = host.onReady;
    host.onReady = nil;
    if (onReady) onReady();
  });

  // Swipes on the touch surface are arrow taps too. They leave the touches alone, so the
  // finger's position keeps arriving while one is recognised.
  for (NSNumber *dir in @[ @(UISwipeGestureRecognizerDirectionUp), @(UISwipeGestureRecognizerDirectionDown),
                           @(UISwipeGestureRecognizerDirectionLeft), @(UISwipeGestureRecognizerDirectionRight) ]) {
    UISwipeGestureRecognizer *swipe = [[UISwipeGestureRecognizer alloc] initWithTarget:self action:@selector(swiped:)];
    swipe.direction = dir.unsignedIntegerValue;
    swipe.cancelsTouchesInView = NO;
    [self.view addGestureRecognizer:swipe];
  }
}

- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated];
  // The fly is something to watch: no screen saver while the app is open.
  UIApplication.sharedApplication.idleTimerDisabled = YES;
}

- (void)swiped:(UISwipeGestureRecognizer *)swipe {
  switch (swipe.direction) {
    case UISwipeGestureRecognizerDirectionUp: [self.remote tap:@"ArrowUp"]; break;
    case UISwipeGestureRecognizerDirectionDown: [self.remote tap:@"ArrowDown"]; break;
    case UISwipeGestureRecognizerDirectionLeft: [self.remote tap:@"ArrowLeft"]; break;
    default: [self.remote tap:@"ArrowRight"]; break;
  }
}

- (void)pressesBegan:(NSSet<UIPress *> *)presses withEvent:(UIPressesEvent *)event {
  NSSet *others = [self.remote pressesBegan:presses];
  if (others.count) [super pressesBegan:others withEvent:event];
}
- (void)pressesEnded:(NSSet<UIPress *> *)presses withEvent:(UIPressesEvent *)event {
  NSSet *others = [self.remote pressesEnded:presses];
  if (others.count) [super pressesEnded:others withEvent:event];
}
- (void)pressesCancelled:(NSSet<UIPress *> *)presses withEvent:(UIPressesEvent *)event {
  NSSet *others = [self.remote pressesEnded:presses];
  if (others.count) [super pressesCancelled:others withEvent:event];
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event { [self.remote touching:YES]; }
- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event { [self.remote touching:NO]; }
- (void)touchesCancelled:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event { [self.remote touching:NO]; }

@end

@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation SceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  self.window.rootViewController = [GameViewController new];
  [self.window makeKeyAndVisible];
}
- (void)sceneWillResignActive:(UIScene *)scene {
  [((GameViewController *)self.window.rootViewController).host setActive:NO];
}
- (void)sceneDidBecomeActive:(UIScene *)scene {
  [((GameViewController *)self.window.rootViewController).host setActive:YES];
}
- (void)sceneDidEnterBackground:(UIScene *)scene {
  // The game hears it is hidden (at a table, it says its fly is away), then every line to a room
  // closes, in that order on the JavaScript thread, before tvOS suspends the app; coming back,
  // the game opens its line again.
  JSHost *host = ((GameViewController *)self.window.rootViewController).host;
  UIApplication *app = UIApplication.sharedApplication;
  __block UIBackgroundTaskIdentifier task = [app beginBackgroundTaskWithExpirationHandler:^{
    [app endBackgroundTask:task];
    task = UIBackgroundTaskInvalid;
  }];
  [host setHidden:YES];
  [host perform:^(JSGlobalContextRef) {
    CloseSocketsGoingAway();
    dispatch_async(dispatch_get_main_queue(), ^{
      if (task != UIBackgroundTaskInvalid) [app endBackgroundTask:task];
      task = UIBackgroundTaskInvalid;
    });
  }];
}
- (void)sceneWillEnterForeground:(UIScene *)scene {
  [((GameViewController *)self.window.rootViewController).host setHidden:NO];
}
@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@end

@implementation AppDelegate
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *config = [[UISceneConfiguration alloc] initWithName:@"Default" sessionRole:session.role];
  config.delegateClass = SceneDelegate.class;
  return config;
}
@end

int main(int argc, char *argv[]) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(AppDelegate.class)); }
}
