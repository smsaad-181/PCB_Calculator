interface Props {
  /** Which part is the unknown; it gets a heavier outline and the word "solved", so it is not marked by colour alone. */
  readonly unknown: 'vout' | 'r1' | 'r2' | 'pair' | null;
  /** Text alternative (where every part sits, in words). */
  readonly description: string;
}

/**
 * Feedback divider schematic: Vout, R1 (top), the FB pin node, R2 (bottom), ground. It exists because textbooks and
 * datasheets name the two resistors differently, so the positions are drawn and written out rather than implied by names.
 * Plain SVG with CSS classes (colours come from the page's CSS variables). No external assets, no inline styles.
 */
export function FeedbackSchematic({ unknown, description }: Props) {
  const r1Solved = unknown === 'r1' || unknown === 'pair';
  const r2Solved = unknown === 'r2' || unknown === 'pair';
  return (
    <figure class="schematic">
      <svg viewBox="0 0 320 270" role="img" aria-labelledby="fbs-title fbs-desc" focusable="false">
        <title id="fbs-title">Regulator feedback divider schematic</title>
        <desc id="fbs-desc">{description}</desc>
        {/* Vout terminal and wire to R1 */}
        <circle class="schem-terminal" cx="140" cy="22" r="5" />
        <text class="schem-text" x="152" y="27">
          Vout
        </text>
        {unknown === 'vout' && (
          <text class="schem-sub" x="152" y="42">
            solved
          </text>
        )}
        <line class="schem-wire" x1="140" y1="27" x2="140" y2="50" />
        {/* R1 (top) */}
        <rect class={r1Solved ? 'schem-box schem-unknown' : 'schem-box'} x="130" y="50" width="20" height="56" />
        <text class="schem-text schem-end" x="120" y="74">
          R1 (top)
        </text>
        {r1Solved && (
          <text class="schem-sub schem-end" x="120" y="92">
            solved
          </text>
        )}
        <line class="schem-wire" x1="140" y1="106" x2="140" y2="164" />
        {/* FB node and the regulator FB pin */}
        <circle class="schem-dot" cx="140" cy="140" r="4" />
        <line class="schem-wire" x1="140" y1="140" x2="232" y2="140" />
        <rect class="schem-box" x="232" y="122" width="76" height="36" />
        <text class="schem-text" x="242" y="145">
          FB pin
        </text>
        <text class="schem-sub" x="236" y="174">
          held at Vref
        </text>
        {/* R2 (bottom) */}
        <rect class={r2Solved ? 'schem-box schem-unknown' : 'schem-box'} x="130" y="164" width="20" height="56" />
        <text class="schem-text schem-end" x="120" y="188">
          R2 (bottom)
        </text>
        {r2Solved && (
          <text class="schem-sub schem-end" x="120" y="206">
            solved
          </text>
        )}
        <line class="schem-wire" x1="140" y1="220" x2="140" y2="240" />
        {/* Ground */}
        <line class="schem-wire" x1="124" y1="248" x2="156" y2="248" />
        <line class="schem-wire" x1="130" y1="254" x2="150" y2="254" />
        <line class="schem-wire" x1="136" y1="260" x2="144" y2="260" />
        <line class="schem-wire" x1="140" y1="240" x2="140" y2="248" />
        <text class="schem-sub" x="164" y="262">
          ground
        </text>
      </svg>
      <figcaption class="schem-legend">
        <ul>
          <li>
            <strong>R1 (top: Vout to FB pin)</strong>
          </li>
          <li>
            <strong>R2 (bottom: FB pin to ground)</strong>
          </li>
        </ul>
      </figcaption>
    </figure>
  );
}
