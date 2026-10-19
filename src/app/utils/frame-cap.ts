// Frame-rate cap for the landing page's decorative WebGL scenes.
//
// requestAnimationFrame follows the display, so on a 120Hz or 144Hz panel the
// hero and the globe render 2-2.4x as often as on a 60Hz one for motion slow
// enough that almost nobody could tell. Measured on an M3 Pro at 120Hz, the
// globe cost about 2ms per frame (1.2ms of main thread, 0.8ms of GPU) and the
// hero about 1.1ms, so the uncapped rate was spending a meaningful slice of a
// core on background decoration. Mid-range phones with 120Hz panels pay
// several times that.
//
// Both scenes drive their animation from elapsed time rather than from a
// frame counter, so dropping frames changes how often they are drawn and
// nothing else: the journey keeps its timing and the globe its rotation
// speed.

/**
 * Ceiling for the decorative scenes. Above a 90Hz display this trims the
 * frame rate; at 60Hz or 90Hz it changes nothing, so the common case is
 * untouched.
 */
export const MAX_SCENE_FPS = 90;

/**
 * Returns a predicate for a render loop: call it once per animation frame
 * with that frame's timestamp, and draw only when it returns true.
 *
 * The schedule advances by exactly one interval per drawn frame rather than
 * being reset to the current time. Resetting would quantise the rate down to
 * the next whole divisor of the refresh rate -- a 90fps cap would come out as
 * 60fps on a 120Hz panel -- whereas advancing keeps the long-run average at
 * the cap even when it does not divide the refresh rate evenly.
 */
export function createFrameCap(
  maxFps: number = MAX_SCENE_FPS,
): (now: number) => boolean {
  const interval = 1000 / maxFps;
  let next = 0;
  return (now) => {
    if (now < next) return false;
    next += interval;
    // Behind by more than a whole frame: a stall, a backgrounded tab or a
    // long task. Start again from now so the scene doesn't then burst to
    // catch up on time it should simply skip.
    if (next < now) next = now + interval;
    return true;
  };
}
