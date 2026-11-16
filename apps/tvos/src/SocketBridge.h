// globalThis.__native.socket: NativeSocketBridge (packages/contracts/src/socket.ts), a table's
// line to its room over NSURLSessionWebSocketTask.
#pragma once
#import <JavaScriptCore/JavaScriptCore.h>

JSObjectRef MakeSocketBridge(JSContextRef ctx);
/** Closes every open line with 1001 (going away), as the app goes to the background. Any thread. */
void CloseSocketsGoingAway(void);
