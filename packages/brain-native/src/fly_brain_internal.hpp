// What a fly_brain handle is, for the library and its own tools (the
// comparison harness reads the brain's double-precision state through it).

#ifndef FLY_BRAIN_INTERNAL_HPP
#define FLY_BRAIN_INTERNAL_HPP

#include "brain.hpp"
#include "fly_brain.h"

struct fly_brain {
  fly::Brain brain;
};

namespace fly {

/**
 * fly_brain_tick with the light given separately (senses' light pointers are
 * not read): for the harness, to pass light the C interface can't express,
 * such as an array of the wrong length.
 */
int tick(fly_brain* brain, double dt_ms, const fly_senses* senses, const Light& light, fly_command* command, fly_stats* stats, float* rates, char* error,
         size_t error_size);

}  // namespace fly

#endif
