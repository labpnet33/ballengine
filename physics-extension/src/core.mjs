/**
 * Standalone engine contract. Nothing in the captured BallEngine bundle imports
 * this module. Register a new mode only after physics, video and UI QA passes.
 */
export const FIXED_DT = 1 / 120;
export const MAX_FRAME_SECONDS = 0.25;
export const MAX_SUBSTEPS = 12;

export class PhysicsClock {
  constructor({ dt = FIXED_DT, maxSubsteps = MAX_SUBSTEPS } = {}) {
    if (!(dt > 0 && Number.isFinite(dt)) || !Number.isInteger(maxSubsteps) || maxSubsteps < 1) {
      throw new RangeError('Invalid simulation stepping configuration');
    }
    this.dt = dt;
    this.maxSubsteps = maxSubsteps;
    this.accumulator = 0;
    this.ticks = 0;
  }
  advance(frameSeconds, simulate) {
    if (!Number.isFinite(frameSeconds) || frameSeconds < 0) throw new RangeError('Invalid frame duration');
    this.accumulator += Math.min(frameSeconds, MAX_FRAME_SECONDS);
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSubsteps) {
      simulate(this.dt);
      this.accumulator -= this.dt;
      this.ticks++;
      steps++;
    }
    // Limit a severely overloaded device's accumulated simulation debt.
    if (steps === this.maxSubsteps) this.accumulator = Math.min(this.accumulator, this.dt);
    return { steps, alpha: Math.max(0, Math.min(1, this.accumulator / this.dt)), ticks: this.ticks };
  }
  reset() { this.accumulator = 0; this.ticks = 0; }
}

export function validateOptions(config, spec) {
  const out = {};
  for (const [name, rule] of Object.entries(spec)) {
    const v = config?.[name] ?? rule.default;
    if (rule.type === 'number') {
      if (!Number.isFinite(v) || v < rule.min || v > rule.max) throw new RangeError(name);
    } else if (rule.type === 'integer') {
      if (!Number.isInteger(v) || v < rule.min || v > rule.max) throw new RangeError(name);
    } else if (rule.type === 'choice') {
      if (!rule.choices.includes(v)) throw new RangeError(name);
    } else throw new Error('Unsupported option type: ' + name);
    out[name] = v;
  }
  return out;
}

export class ImpactEvents {
  constructor({ minImpulse = 0.15, cooldownTicks = 7, maxQueued = 256 } = {}) {
    this.minImpulse = minImpulse;
    this.cooldownTicks = cooldownTicks;
    this.maxQueued = maxQueued;
    this.last = new Map();
    this.events = [];
  }
  add(a, b, impulse, tick) {
    if (!Number.isFinite(impulse) || impulse < this.minImpulse) return false;
    const names = [String(a), String(b)].sort();
    const key = names.join('|');
    if (tick - (this.last.get(key) ?? -Infinity) < this.cooldownTicks) return false;
    this.last.set(key, tick);
    if (this.events.length >= this.maxQueued) this.events.shift();
    this.events.push({ a: names[0], b: names[1], impulse, tick, kind: 'impact' });
    if (this.last.size > 2048) for (const [k, t] of this.last) if (tick - t > 1500) this.last.delete(k);
    return true;
  }
  drain() { return this.events.splice(0); }
  clear() { this.last.clear(); this.events.length = 0; }
}
