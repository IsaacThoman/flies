#import "Remote.h"
#import "JSHost.h"
#import <GameController/GameController.h>
#include <algorithm>

// packages/contracts/src/remote.ts: the first repeat of a held button, then the rest.
static const NSTimeInterval kRepeatDelay = 0.4, kRepeatInterval = 0.1;

static NSString *KeyForPress(UIPressType type) {
  switch (type) {
    case UIPressTypeUpArrow: return @"ArrowUp";
    case UIPressTypeDownArrow: return @"ArrowDown";
    case UIPressTypeLeftArrow: return @"ArrowLeft";
    case UIPressTypeRightArrow: return @"ArrowRight";
    case UIPressTypeSelect: return @"Enter";
    case UIPressTypeMenu: return @"Escape";
    case UIPressTypePlayPause: return @"MediaPlayPause";
    default: return nil;
  }
}

@implementation Remote {
  __weak JSHost *_host;
  /** Held keys and their repeat timers. */
  NSMutableDictionary<NSString *, NSTimer *> *_held;
  /** The presses the game took when they began, and their keys. */
  NSMapTable<UIPress *, NSString *> *_taken;
  float _x, _y;
  BOOL _touching, _uikitTouching;
}

- (instancetype)initWithHost:(JSHost *)host {
  if ((self = [super init])) {
    _host = host;
    _held = [NSMutableDictionary dictionary];
    _taken = [NSMapTable strongToStrongObjectsMapTable];
    // The finger's position comes from the GameController framework: UIKit only reports how a
    // touch moves, from wherever it landed. Presses still come from UIKit only (no button
    // handlers here), so nothing is reported twice.
    for (GCController *controller in GCController.controllers) [self watch:controller];
    [NSNotificationCenter.defaultCenter addObserverForName:GCControllerDidConnectNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
      [self watch:note.object];
    }];
  }
  return self;
}

- (void)watch:(GCController *)controller {
  GCMicroGamepad *pad = controller.microGamepad;
  if (!pad) return;
  pad.reportsAbsoluteDpadValues = YES;
  __weak Remote *weakSelf = self;
  pad.dpad.valueChangedHandler = ^(GCControllerDirectionPad *, float x, float y) { [weakSelf dpadX:x y:y]; };
  HostLog(0, [NSString stringWithFormat:@"remote touch surface: %@", controller.vendorName ?: @"a micro gamepad"]);
}

// The dpad reads exactly (0, 0) once the finger has lifted; the position stays where it was, as
// the contract asks. Whether a finger is down comes from UIKit's touches when it has any.
- (void)dpadX:(float)x y:(float)y {
  if (x == 0 && y == 0) {
    if (!_uikitTouching) [self touchAtX:_x y:_y touching:NO];
    return;
  }
  [self touchAtX:x y:y touching:YES];
}

- (void)touching:(BOOL)touching {
  _uikitTouching = touching;
  [self touchAtX:_x y:_y touching:touching];
}

- (void)touchAtX:(float)x y:(float)y touching:(BOOL)touching {
  if (x == _x && y == _y && touching == _touching) return;
  _x = std::clamp(x, -1.f, 1.f);
  _y = std::clamp(y, -1.f, 1.f);
  _touching = touching;
  [_host sendTouchX:_x y:_y touching:_touching];
}

- (void)keyDown:(NSString *)key {
  if (_held[key]) return;
  [_host sendKey:key code:key type:@"keydown" repeat:NO];
  __weak Remote *weakSelf = self;
  _held[key] = [NSTimer scheduledTimerWithTimeInterval:kRepeatDelay repeats:NO block:^(NSTimer *) { [weakSelf startRepeating:key]; }];
}

- (void)startRepeating:(NSString *)key {
  if (!_held[key]) return;
  __weak JSHost *host = _host;
  void (^repeat)(NSTimer *) = ^(NSTimer *) { [host sendKey:key code:key type:@"keydown" repeat:YES]; };
  repeat(nil);
  _held[key] = [NSTimer scheduledTimerWithTimeInterval:kRepeatInterval repeats:YES block:repeat];
}

- (void)keyUp:(NSString *)key {
  NSTimer *timer = _held[key];
  if (!timer) return;
  [timer invalidate];
  [_held removeObjectForKey:key];
  [_host sendKey:key code:key type:@"keyup" repeat:NO];
}

- (void)tap:(NSString *)key {
  if (_held[key]) return;
  [_host sendKey:key code:key type:@"keydown" repeat:NO];
  [_host sendKey:key code:key type:@"keyup" repeat:NO];
}

// Whether the game takes a press is decided once, when it begins: a Back press that began at
// the root goes to tvOS (which leaves the app) even if the game moves on meanwhile.
- (NSSet<UIPress *> *)pressesBegan:(NSSet<UIPress *> *)presses {
  NSMutableSet *others = [NSMutableSet set];
  for (UIPress *press in presses) {
    NSString *key = KeyForPress(press.type);
    if (!key || (press.type == UIPressTypeMenu && _host.atRoot)) { [others addObject:press]; continue; }
    [_taken setObject:key forKey:press];
    [self keyDown:key];
  }
  return others;
}

- (NSSet<UIPress *> *)pressesEnded:(NSSet<UIPress *> *)presses {
  NSMutableSet *others = [NSMutableSet set];
  for (UIPress *press in presses) {
    NSString *key = [_taken objectForKey:press];
    if (!key) { [others addObject:press]; continue; }
    [_taken removeObjectForKey:press];
    [self keyUp:key];
  }
  return others;
}

- (void)scriptedPress:(NSString *)key holdMs:(double)ms {
  if ([key isEqual:@"Escape"] && _host.atRoot) {
    HostLog(0, @"input: Back at the root goes to tvOS, which leaves the app");
    return;
  }
  [self keyDown:key];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(ms * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{ [self keyUp:key]; });
}

@end
