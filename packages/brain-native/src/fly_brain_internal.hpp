// What a fly_brain handle is, for the library and its own tools (the
// comparison harness reads the brain's double-precision state through it).

#ifndef FLY_BRAIN_INTERNAL_HPP
#define FLY_BRAIN_INTERNAL_HPP

#include "brain.hpp"

struct fly_brain {
  fly::Brain brain;
};

#endif
