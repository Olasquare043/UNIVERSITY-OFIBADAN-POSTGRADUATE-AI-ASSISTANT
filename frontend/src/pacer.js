// Reveals streamed text at a steady pace. Tokens can arrive in bursts, so each
// frame reveals a share of the backlog; the reveal never trails the stream by
// much more than a third of a second.
export function createPacer(onText) {
  let target = "";
  let shown = 0;
  let frame = null;

  function tick() {
    frame = null;
    const backlog = target.length - shown;
    if (backlog <= 0) return;

    shown += Math.max(1, Math.ceil(backlog / 20));
    onText(target.slice(0, shown));
    if (shown < target.length) frame = requestAnimationFrame(tick);
  }

  return {
    push(text) {
      target += text;
      if (frame === null) frame = requestAnimationFrame(tick);
    },
    // Everything received so far, whether or not it has been revealed yet.
    received: () => target,
    stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
