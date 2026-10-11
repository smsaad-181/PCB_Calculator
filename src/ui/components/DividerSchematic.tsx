interface Props {
  readonly withLoad: boolean;
  /** Which part is the unknown; it gets a heavier outline and the word "solved", so it is not marked by colour alone. */
  readonly unknown: 'vout' | 'r1' | 'r2';
  /** Text alternative (where every resistor sits, in words). */
  readonly description: string;
}

/**
 * Divider schematic: Vin, R1 (top), the Vout node, R2 (bottom), ground, and an optional load RL in parallel with R2.
 * Plain SVG with CSS classes (colours come from the page's CSS variables). No external assets, no inline styles.
 */
export function DividerSchematic({ withLoad, unknown, description }: Props) {
  return (
    <figure class="schematic">
      <svg viewBox="0 0 320 270" role="img" aria-labelledby="schem-title schem-desc" focusable="false">
        <title id="schem-title">Resistor divider schematic</title>
        <desc id="schem-desc">{description}</desc>
        {/* Vin terminal and wire to R1 */}
        <circle class="schem-terminal" cx="140" cy="22" r="5" />
        <text class="schem-text" x="152" y="27">
          Vin
        </text>
        <line class="schem-wire" x1="140" y1="27" x2="140" y2="50" />
        {/* R1 (top) */}
        <rect class={unknown === 'r1' ? 'schem-box schem-unknown' : 'schem-box'} x="130" y="50" width="20" height="56" />
        <text class="schem-text schem-end" x="120" y="74">
          R1 (top)
        </text>
        {unknown === 'r1' && (
          <text class="schem-sub schem-end" x="120" y="92">
            solved
          </text>
        )}
        <line class="schem-wire" x1="140" y1="106" x2="140" y2="164" />
        {/* Vout node and output wire */}
        <circle class="schem-dot" cx="140" cy="140" r="4" />
        <line class="schem-wire" x1="140" y1="140" x2="280" y2="140" />
        <circle class="schem-terminal" cx="280" cy="140" r="5" />
        <text class="schem-text schem-end" x="276" y="128">
          Vout
        </text>
        {unknown === 'vout' && (
          <text class="schem-sub schem-end" x="276" y="162">
            solved
          </text>
        )}
        {/* R2 (bottom) */}
        <rect class={unknown === 'r2' ? 'schem-box schem-unknown' : 'schem-box'} x="130" y="164" width="20" height="56" />
        <text class="schem-text schem-end" x="120" y="188">
          R2 (bottom)
        </text>
        {unknown === 'r2' && (
          <text class="schem-sub schem-end" x="120" y="206">
            solved
          </text>
        )}
        <line class="schem-wire" x1="140" y1="220" x2="140" y2="240" />
        {/* Optional load RL in parallel with R2 */}
        {withLoad && (
          <g>
            <circle class="schem-dot" cx="220" cy="140" r="4" />
            <line class="schem-wire" x1="220" y1="140" x2="220" y2="164" />
            <rect class="schem-box" x="210" y="164" width="20" height="56" />
            <text class="schem-text" x="238" y="188">
              RL
            </text>
            <text class="schem-sub" x="238" y="206">
              load
            </text>
            <line class="schem-wire" x1="220" y1="220" x2="220" y2="240" />
            <line class="schem-wire" x1="140" y1="240" x2="220" y2="240" />
          </g>
        )}
        {/* Ground */}
        <line class="schem-wire" x1={withLoad ? 180 : 140} y1="240" x2={withLoad ? 180 : 140} y2="248" />
        <line class="schem-wire" x1={withLoad ? 164 : 124} y1="248" x2={withLoad ? 196 : 156} y2="248" />
        <line class="schem-wire" x1={withLoad ? 170 : 130} y1="254" x2={withLoad ? 190 : 150} y2="254" />
        <line class="schem-wire" x1={withLoad ? 176 : 136} y1="260" x2={withLoad ? 184 : 144} y2="260" />
        <text class="schem-sub" x={withLoad ? 204 : 164} y="262">
          ground
        </text>
      </svg>
      <figcaption class="schem-legend">
        <ul>
          <li>
            <strong>R1 (top: Vin to Vout)</strong>
          </li>
          <li>
            <strong>R2 (bottom: Vout to ground)</strong>
          </li>
          {withLoad && (
            <li>
              <strong>RL (load: Vout to ground, in parallel with R2)</strong>
            </li>
          )}
        </ul>
      </figcaption>
    </figure>
  );
}
