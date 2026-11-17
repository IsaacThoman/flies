// Slow transmitter levels and receptor effects, in modulation.ts's order.
#ifndef FLY_MODULATION_HPP
#define FLY_MODULATION_HPP

#include "exact.hpp"
#include "io.hpp"

namespace fly {

class Modulation {
 public:
  struct StandIn {
    double level = 0, target = 0;
    bool started = false;
  };
  struct Route {
    std::string receptor;
    bool release;
    double full, effect, wired, rise, fall;
    int32_t stand_in;
    std::vector<uint32_t> carriers, ptr, from, at;
    std::vector<double> synapses, total, engaged, factors;
  };
  Modulation(const Connectome& connectome, const io::Wiring& wiring);
  void set_state(const io::Senses& senses, double hunger);
  void update(double ran);
  double level_of(uint32_t neuron) const;
  std::vector<uint32_t> sources, counts, excitable;
  std::vector<double> level, bias;
  std::vector<StandIn> stand_ins;
  std::vector<Route> routes;

 private:
  struct Excitability {
    io::StateKey state;
    double mv, value;
    std::vector<uint32_t> at;
  };
  std::vector<int32_t> source_of_;
  std::vector<Excitability> excitability_;
};

}  // namespace fly
#endif
