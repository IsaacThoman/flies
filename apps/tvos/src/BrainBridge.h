// globalThis.__native.brain: NativeBrainBridge (packages/contracts/src/brain.ts) over the C++
// brain (packages/brain-native/include/fly_brain.h), run on a thread of its own; its spawn()
// makes another, one for each fly the game lives.
#pragma once
#import <Foundation/Foundation.h>
#import <JavaScriptCore/JavaScriptCore.h>

/** The first brain's bridge object; every brain loads `connectome` (a packed connectome.bin) once started. */
JSObjectRef MakeBrainBridge(JSContextRef ctx, NSString *connectome);
