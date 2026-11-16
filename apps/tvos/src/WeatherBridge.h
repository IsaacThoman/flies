// globalThis.__native.weather: NativeWeatherBridge (packages/contracts/src/weather.ts), when the
// app is built with its weather service (apps/tvos/weather).
#pragma once
#import <JavaScriptCore/JavaScriptCore.h>

/** The bridge object, or nullptr when this build has no weather service. */
JSObjectRef MakeWeatherBridge(JSContextRef ctx);
