// globalThis.__native.brain: NativeBrainBridge (packages/contracts/src/brain.ts) over the C++
// brain (packages/brain-native/include/fly_brain.h), run on a thread of its own.
#pragma once
#import <Foundation/Foundation.h>
#import <JavaScriptCore/JavaScriptCore.h>

/** The bridge object; the brain loads `connectome` (a packed connectome.bin) once started. */
JSObjectRef MakeBrainBridge(JSContextRef ctx, NSString *connectome);
