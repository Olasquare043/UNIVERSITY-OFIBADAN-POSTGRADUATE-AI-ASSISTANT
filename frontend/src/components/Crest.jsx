const RATIO = 318 / 440;

export default function Crest({ height = 32, alt = "" }) {
  return (
    <img
      className="crest"
      src="/ui-crest.png"
      alt={alt}
      height={height}
      width={Math.round(height * RATIO)}
      aria-hidden={alt ? undefined : "true"}
    />
  );
}
