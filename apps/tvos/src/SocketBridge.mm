// A table's line to its room, for a runtime with no WebSocket of its own. Each line is an
// NSURLSessionWebSocketTask whose session calls back on a queue of the bridge's own, never the
// JavaScript or main thread. What arrives waits in the line's inbox until the game polls for it
// once a frame (apps/web/src/online/native-socket.ts): a binary message is copied straight into
// the game's own buffer, so taking one makes nothing in JavaScript.
//
// The lines' state is shared by that queue and the JavaScript thread under one lock, held only
// to look and to copy: a frame with nothing new is two calls, each a lookup.
#import "SocketBridge.h"
#import "JSHost.h"
#import <Foundation/Foundation.h>
#include <os/lock.h>
#include <unordered_map>

namespace {
// As much as a browser's line keeps (apps/web/src/online/socket.ts), waiting to be taken or to go;
// a line that falls further behind is closed, and opened again, with the room's state as it is now.
constexpr NSUInteger kMessages = 256;
constexpr NSUInteger kBytes = 256 * 1024;
// NATIVE_SOCKET_CONNECTING, _OPEN and _CLOSED.
enum : int { kConnecting = 0, kOpen = 1, kClosed = 2 };
// A WebSocket's close codes: a line that failed or dropped without one, as a browser reports it;
// a message too big to take; leaving.
constexpr int kAbnormal = 1006, kTooBig = 1009, kGoingAway = 1001;

NSString *ToNS(JSContextRef ctx, JSValueRef v) {
  JSStringRef s = JSValueToStringCopy(ctx, v, nullptr);
  if (!s) return @"";
  NSString *r = (__bridge_transfer NSString *)JSStringCopyCFString(kCFAllocatorDefault, s);
  JSStringRelease(s);
  return r;
}

// Strings count three bytes a UTF-16 unit, as the browser's line counts them, without encoding them.
NSUInteger Weight(id message) { return [message isKindOfClass:NSData.class] ? ((NSData *)message).length : ((NSString *)message).length * 3; }
}  // namespace

@interface FlyLine : NSObject <NSURLSessionWebSocketDelegate>
- (instancetype)initWithURL:(NSURL *)url;
@end

namespace {
os_unfair_lock gLock = OS_UNFAIR_LOCK_INIT;
std::unordered_map<int, FlyLine *> gLines;
int gNextId = 1;
NSOperationQueue *gQueue;
}  // namespace

// Everything but the task itself is guarded by gLock.
@implementation FlyLine {
 @public
  NSURLSession *_session;
  NSURLSessionWebSocketTask *_task;
  int _status;
  int _code;
  NSString *_reason;
  BOOL _opened;
  NSMutableArray *_inbox;
  NSUInteger _inboxBytes;
  NSUInteger _sendingBytes, _sending;
}

- (instancetype)initWithURL:(NSURL *)url {
  if ((self = [super init])) {
    _inbox = [NSMutableArray array];
    _reason = @"";
    BOOL ws = [url.scheme isEqualToString:@"ws"] || [url.scheme isEqualToString:@"wss"];
    if (!url.host || !ws) {
      _status = kClosed;
      _code = kAbnormal;
      return self;
    }
    _status = kConnecting;
    // No cache, cookies or credentials kept: the hello is all the room needs.
    NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    // The session keeps its delegate (this line) until it is invalidated, when the game forgets the line.
    _session = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:gQueue];
    _task = [_session webSocketTaskWithURL:url];
    _task.maximumMessageSize = kBytes;
    [_task resume];
    [self receive];
  }
  return self;
}

- (void)receive {
  __weak FlyLine *weakSelf = self;
  [_task receiveMessageWithCompletionHandler:^(NSURLSessionWebSocketMessage *message, NSError *error) {
    FlyLine *line = weakSelf;
    // A failure ends the task, and the task's end says how (below).
    if (!line || error || !message) return;
    if ([line arrived:message.type == NSURLSessionWebSocketMessageTypeData ? message.data : message.string]) [line receive];
  }];
}

/** Into the inbox, unless the line has fallen too far behind. False once the line is closed. */
- (BOOL)arrived:(id)message {
  os_unfair_lock_lock(&gLock);
  BOOL open = _status != kClosed;
  NSUInteger weight = Weight(message);
  // An empty binary message would read as nothing waiting; the room never sends one.
  if (open && weight > 0) {
    if (_inbox.count >= kMessages || _inboxBytes + weight > kBytes) {
      [self fallBehind];
      open = NO;
    } else {
      [_inbox addObject:message];
      _inboxBytes += weight;
    }
  }
  os_unfair_lock_unlock(&gLock);
  return open;
}

/** Under the lock: closed by this side, unless it already is. */
- (void)closeWith:(int)code reason:(NSString *)reason {
  if (_status == kClosed) return;
  _status = kClosed;
  _code = code;
  _reason = reason;
  [_task cancelWithCloseCode:(NSURLSessionWebSocketCloseCode)code reason:[reason dataUsingEncoding:NSUTF8StringEncoding]];
}

/** Under the lock: a backlog too big to be worth working through; coming back gives the room's state as it is now. */
- (void)fallBehind {
  [_inbox removeAllObjects];
  _inboxBytes = 0;
  [self closeWith:1000 reason:@"line fell behind"];
}

/** Under the lock: closed from the other end, or failed. */
- (void)ended:(int)code reason:(NSString *)reason {
  if (_status == kClosed) return;
  _status = kClosed;
  _code = code;
  _reason = reason ?: @"";
}

- (void)URLSession:(NSURLSession *)session webSocketTask:(NSURLSessionWebSocketTask *)task didOpenWithProtocol:(NSString *)protocol {
  os_unfair_lock_lock(&gLock);
  if (_status == kConnecting) {
    _status = kOpen;
    _opened = YES;
  }
  os_unfair_lock_unlock(&gLock);
}

- (void)URLSession:(NSURLSession *)session webSocketTask:(NSURLSessionWebSocketTask *)task didCloseWithCode:(NSURLSessionWebSocketCloseCode)code reason:(NSData *)reason {
  NSString *why = reason ? [[NSString alloc] initWithData:reason encoding:NSUTF8StringEncoding] : @"";
  os_unfair_lock_lock(&gLock);
  [self ended:(int)code reason:why];
  os_unfair_lock_unlock(&gLock);
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  // The room's close, if one came; else the line dropped or never opened.
  NSURLSessionWebSocketTask *ws = (NSURLSessionWebSocketTask *)task;
  BOOL closed = ws.closeCode != NSURLSessionWebSocketCloseCodeInvalid;
  NSString *why = closed && ws.closeReason ? [[NSString alloc] initWithData:ws.closeReason encoding:NSUTF8StringEncoding] : @"";
  os_unfair_lock_lock(&gLock);
  [self ended:closed ? (int)ws.closeCode : kAbnormal reason:why];
  os_unfair_lock_unlock(&gLock);
}

@end

namespace {
FlyLine *Find(JSContextRef ctx, size_t argc, const JSValueRef argv[]) {
  if (!argc) return nil;
  auto it = gLines.find((int)JSValueToNumber(ctx, argv[0], nullptr));
  return it == gLines.end() ? nil : it->second;
}

#define NATIVE(name) JSValueRef name(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef *)

NATIVE(S_open) {
  FlyLine *line = [[FlyLine alloc] initWithURL:[NSURL URLWithString:argc ? ToNS(ctx, argv[0]) : @""]];
  os_unfair_lock_lock(&gLock);
  int id = gNextId++;
  gLines[id] = line;
  os_unfair_lock_unlock(&gLock);
  return JSValueMakeNumber(ctx, id);
}

// Closed only once everything that came before the close has been taken, as a browser hands on
// its messages before its close event: a frame that finds the inbox empty and then the line
// closed has missed nothing.
NATIVE(S_status) {
  os_unfair_lock_lock(&gLock);
  FlyLine *line = Find(ctx, argc, argv);
  int status = !line ? kClosed : line->_status != kClosed ? line->_status : line->_inbox.count ? (line->_opened ? kOpen : kConnecting) : kClosed;
  os_unfair_lock_unlock(&gLock);
  return JSValueMakeNumber(ctx, status);
}

NATIVE(S_closeCode) {
  os_unfair_lock_lock(&gLock);
  FlyLine *line = Find(ctx, argc, argv);
  int code = line && line->_status == kClosed ? line->_code : line ? 0 : kAbnormal;
  os_unfair_lock_unlock(&gLock);
  return JSValueMakeNumber(ctx, code);
}

NATIVE(S_closeReason) {
  os_unfair_lock_lock(&gLock);
  FlyLine *line = Find(ctx, argc, argv);
  NSString *reason = line && line->_status == kClosed ? line->_reason : @"";
  os_unfair_lock_unlock(&gLock);
  return JSStringValue(ctx, reason);
}

NATIVE(S_send) {
  if (argc < 2) return JSValueMakeUndefined(ctx);
  // A typed array's bytes (what the game sends), or a text.
  id message;
  size_t length = 0;
  uint8_t *bytes = JSBytesOf(ctx, argv[1], &length);
  if (bytes) message = [NSData dataWithBytes:bytes length:length];
  else message = ToNS(ctx, argv[1]);
  NSUInteger weight = Weight(message);
  os_unfair_lock_lock(&gLock);
  FlyLine *line = Find(ctx, argc, argv);
  NSURLSessionWebSocketTask *task = nil;
  if (line && line->_status == kOpen) {
    if (line->_sending >= kMessages || line->_sendingBytes + weight > kBytes) [line fallBehind];
    else {
      line->_sending++;
      line->_sendingBytes += weight;
      task = line->_task;
    }
  }
  os_unfair_lock_unlock(&gLock);
  if (!task) return JSValueMakeUndefined(ctx);
  NSURLSessionWebSocketMessage *m = bytes ? [[NSURLSessionWebSocketMessage alloc] initWithData:message] : [[NSURLSessionWebSocketMessage alloc] initWithString:message];
  [task sendMessage:m completionHandler:^(NSError *) {
    // A failed send ends the task, which says so.
    os_unfair_lock_lock(&gLock);
    line->_sending--;
    line->_sendingBytes -= weight;
    os_unfair_lock_unlock(&gLock);
  }];
  return JSValueMakeUndefined(ctx);
}

NATIVE(S_next) {
  size_t room = 0;
  uint8_t *into = nullptr;
  if (argc > 1 && JSValueGetTypedArrayType(ctx, argv[1], nullptr) == kJSTypedArrayTypeArrayBuffer) {
    JSObjectRef buffer = (JSObjectRef)argv[1];
    room = JSObjectGetArrayBufferByteLength(ctx, buffer, nullptr);
    into = (uint8_t *)JSObjectGetArrayBufferBytesPtr(ctx, buffer, nullptr);
  }
  os_unfair_lock_lock(&gLock);
  FlyLine *line = Find(ctx, argc, argv);
  id message = line ? line->_inbox.firstObject : nil;
  JSValueRef result = JSValueMakeNumber(ctx, 0);
  if ([message isKindOfClass:NSData.class]) {
    NSData *data = message;
    if (!into || data.length > room) {
      [line->_inbox removeAllObjects];
      line->_inboxBytes = 0;
      [line closeWith:kTooBig reason:@""];
      message = nil;
    } else {
      memcpy(into, data.bytes, data.length);
      result = JSValueMakeNumber(ctx, data.length);
    }
  }
  if (message) {
    line->_inboxBytes -= Weight(message);
    [line->_inbox removeObjectAtIndex:0];
  }
  os_unfair_lock_unlock(&gLock);
  return [message isKindOfClass:NSString.class] ? JSStringValue(ctx, message) : result;
}

NATIVE(S_close) {
  NSString *reason = argc > 2 ? ToNS(ctx, argv[2]) : @"";
  os_unfair_lock_lock(&gLock);
  FlyLine *line = Find(ctx, argc, argv);
  if (line) {
    gLines.erase((int)JSValueToNumber(ctx, argv[0], nullptr));
    [line closeWith:argc > 1 ? (int)JSValueToNumber(ctx, argv[1], nullptr) : 1000 reason:reason];
    [line->_inbox removeAllObjects];
  }
  os_unfair_lock_unlock(&gLock);
  // Lets the close go out, then lets go of the line.
  if (line) [line->_session finishTasksAndInvalidate];
  return JSValueMakeUndefined(ctx);
}
}  // namespace

JSObjectRef MakeSocketBridge(JSContextRef ctx) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    gQueue = [NSOperationQueue new];
    gQueue.name = @"flies.socket";
    gQueue.maxConcurrentOperationCount = 1;
    gQueue.qualityOfService = NSQualityOfServiceUserInitiated;
  });
  JSObjectRef bridge = JSObjectMake(ctx, nullptr, nullptr);
  struct { const char *name; JSObjectCallAsFunctionCallback fn; } fns[] = {
    { "open", S_open }, { "status", S_status }, { "closeCode", S_closeCode }, { "closeReason", S_closeReason },
    { "send", S_send }, { "next", S_next }, { "close", S_close },
  };
  for (auto &f : fns) {
    JSStringRef s = JSStringCreateWithUTF8CString(f.name);
    JSObjectSetProperty(ctx, bridge, s, JSObjectMakeFunctionWithCallback(ctx, s, f.fn), kJSPropertyAttributeReadOnly, nullptr);
    JSStringRelease(s);
  }
  return bridge;
}

void CloseSocketsGoingAway() {
  os_unfair_lock_lock(&gLock);
  for (auto &[id, line] : gLines) [line closeWith:kGoingAway reason:@""];
  os_unfair_lock_unlock(&gLock);
}
