// The transcendental functions as V8 computes them (see fdlibm.cpp). Every
// Math.exp, Math.log, Math.log1p, Math.expm1, Math.sin and Math.cos in the
// TypeScript brain is one of these here, never the <cmath> one.

#ifndef FLY_FDLIBM_HPP
#define FLY_FDLIBM_HPP

namespace fly::fdlibm {

double exp(double x);
double log(double x);
double log1p(double x);
double expm1(double x);
double sin(double x);
double cos(double x);

}  // namespace fly::fdlibm

#endif
