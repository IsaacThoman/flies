// The Siri Remote as the game sees it (packages/contracts/src/remote.ts): buttons as keydown and
// keyup with repeats, swipes as arrow taps, and the finger on the touch surface as remotetouch.
// Main thread only.
#pragma once
#import <UIKit/UIKit.h>

@class JSHost;

@interface Remote : NSObject
- (instancetype)initWithHost:(JSHost *)host;

/** UIKit presses. Each returns the presses the game didn't take, for the responder chain:
 *  Back at the root of the game, and buttons the game has no key for. */
- (NSSet<UIPress *> *)pressesBegan:(NSSet<UIPress *> *)presses;
- (NSSet<UIPress *> *)pressesEnded:(NSSet<UIPress *> *)presses;

/** A finger landed on or left the touch surface (UIKit touches). */
- (void)touching:(BOOL)touching;

/** A key pressed and released at once (swipes). */
- (void)tap:(NSString *)key;
/** Scripted input: the same paths as the remote's. */
- (void)scriptedPress:(NSString *)key holdMs:(double)ms;
- (void)touchAtX:(float)x y:(float)y touching:(BOOL)touching;
@end
