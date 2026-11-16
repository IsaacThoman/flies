// The weather outside, for the game. The service is Swift (apps/tvos/weather: WeatherKit and
// Core Location, or the simulator check's stand-in), compiled in only when scripts/tvos.ts
// builds with it; this finds it by its Objective-C name, so a build without it needs no Swift
// and has no __native.weather, and the game keeps its made-up forecast.
//
// Every call returns at once: start and stop hand over to the main actor, and the rest copy
// what the service last wrote, under its lock.
#import "WeatherBridge.h"
#import "JSHost.h"
#import <Foundation/Foundation.h>

@protocol FlyOutsideWeather <NSObject>
+ (id<FlyOutsideWeather>)shared;
- (void)start;
- (void)stop;
@property(readonly) NSString *status;
@property(readonly) NSString *error;
@property(readonly) NSInteger version;
@property(readonly, nullable) NSString *conditions;
@property(readonly, nullable) NSString *attribution;
@end

namespace {
id<FlyOutsideWeather> gWeather;

JSValueRef FromJSON(JSContextRef ctx, NSString *json) {
  if (!json) return JSValueMakeNull(ctx);
  JSStringRef s = JSStringCreateWithCFString((__bridge CFStringRef)json);
  JSValueRef v = JSValueMakeFromJSONString(ctx, s);
  JSStringRelease(s);
  return v ?: JSValueMakeNull(ctx);
}

#define NATIVE(name) JSValueRef name(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t, const JSValueRef[], JSValueRef *)

NATIVE(W_start) { [gWeather start]; return JSValueMakeUndefined(ctx); }
NATIVE(W_stop) { [gWeather stop]; return JSValueMakeUndefined(ctx); }
NATIVE(W_status) { return JSStringValue(ctx, gWeather.status); }
NATIVE(W_error) { return JSStringValue(ctx, gWeather.error); }
NATIVE(W_version) { return JSValueMakeNumber(ctx, gWeather.version); }
NATIVE(W_conditions) { return FromJSON(ctx, gWeather.conditions); }
NATIVE(W_attribution) { return FromJSON(ctx, gWeather.attribution); }
}  // namespace

JSObjectRef MakeWeatherBridge(JSContextRef ctx) {
  Class<FlyOutsideWeather> service = (Class<FlyOutsideWeather>)NSClassFromString(@"FlyOutsideWeather");
  if (!service) return nullptr;
  gWeather = [service shared];
  JSObjectRef bridge = JSObjectMake(ctx, nullptr, nullptr);
  struct { const char *name; JSObjectCallAsFunctionCallback fn; } fns[] = {
    { "start", W_start }, { "stop", W_stop }, { "status", W_status }, { "error", W_error },
    { "version", W_version }, { "conditions", W_conditions }, { "attribution", W_attribution },
  };
  for (auto &f : fns) {
    JSStringRef s = JSStringCreateWithUTF8CString(f.name);
    JSObjectSetProperty(ctx, bridge, s, JSObjectMakeFunctionWithCallback(ctx, s, f.fn), kJSPropertyAttributeReadOnly, nullptr);
    JSStringRelease(s);
  }
  return bridge;
}
