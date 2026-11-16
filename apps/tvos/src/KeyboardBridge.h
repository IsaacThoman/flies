// globalThis.__native.keyboard: NativeKeyboardBridge (packages/contracts/src/text-entry.ts), tvOS's
// own keyboard over the game, for the little it asks to be typed.
#pragma once
#import <Foundation/Foundation.h>
#import <JavaScriptCore/JavaScriptCore.h>

/** `typed` is the launch config's answers for unattended runs, or nil: each keyboard shown is
 *  answered with the next after a moment, as if typed and confirmed (NSNull: as if gone back). */
JSObjectRef MakeKeyboardBridge(JSContextRef ctx, NSArray *typed);
