/* =========================================================
 *  일러스트 (포스터 모티프: 연꽃 · 연잎 · 두 물길 · 황포돛배 · 느티나무)
 * ========================================================= */
(function () {
  const PETAL = "M0 0 C-10 -9 -11 -31 0 -42 C11 -31 10 -9 0 0Z";
  const COLOR = {
    pink:   { c: "#EE3E92", mid: "#F47AB3", soft: "#FDE6F1", ink: "#B51F66" },
    water:  { c: "#3FA9B4", mid: "#8FD2D8", soft: "#DDF2F4", ink: "#1C6F78" },
    green:  { c: "#1D8D57", mid: "#62B488", soft: "#E3F3EA", ink: "#13653D" },
    yellow: { c: "#F7B23B", mid: "#FDCB6E", soft: "#FFF1D2", ink: "#8A5A00" }
  };

  function lotus(x, y, s) {
    const outer = [-66, -33, 33, 66].map(a => `<path class="a" d="${PETAL}" transform="rotate(${a})"/>`).join("");
    const inner = [-16, 16].map(a => `<path class="b" d="${PETAL}" transform="rotate(${a}) scale(.86)"/>`).join("");
    const front = `<path class="a" d="${PETAL}" transform="scale(.92,.78)"/>`;
    return `<g transform="translate(${x} ${y}) scale(${s})">${outer}${inner}${front}</g>`;
  }
  function pad(cx, cy, rx, ry, rot) {
    const a1 = -100 * Math.PI / 180, a2 = -80 * Math.PI / 180;
    const x1 = cx + rx * Math.cos(a1), y1 = cy + ry * Math.sin(a1);
    const x2 = cx + rx * Math.cos(a2), y2 = cy + ry * Math.sin(a2);
    const veins = [-150, -30, 150, 30, 90].map(a => {
      const r = a * Math.PI / 180;
      return `<path class="v" d="M${cx} ${cy} L${(cx + rx * .78 * Math.cos(r)).toFixed(1)} ${(cy + ry * .78 * Math.sin(r)).toFixed(1)}"/>`;
    }).join("");
    return `<g transform="rotate(${rot || 0} ${cx} ${cy})"><path class="a" d="M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${rx} ${ry} 0 1 0 ${x2.toFixed(1)} ${y2.toFixed(1)} Z"/>${veins}</g>`;
  }

  /* 16개 조각 (미션 순서와 같은 순서) */
  const PIECES = [
    // 연꽃 분홍 0-3
    { c: "pink", svg: lotus(180, 238, 1.32) },
    { c: "pink", svg: lotus(64, 214, .78) },
    { c: "pink", svg: lotus(300, 208, .84) },
    { c: "pink", svg: `<g transform="translate(244 156)"><path class="b" d="M0 0 C-12 -10 -11 -30 0 -40 C11 -30 12 -10 0 0Z"/><path class="a" d="M0 0 C-14 -4 -18 -18 -16 -26 C-8 -18 -4 -10 0 0Z"/><path class="a" d="M0 0 C14 -4 18 -18 16 -26 C8 -18 4 -10 0 0Z"/></g>` },
    // 두물 물빛 4-7
    { c: "water", svg: `<path class="a" d="M-10 56 C50 58 104 94 152 126 L176 146 C122 124 56 102 -10 100 Z"/>` },
    { c: "water", svg: `<path class="a" d="M370 70 C310 76 250 104 200 130 L184 148 C236 128 306 112 370 114 Z"/>` },
    { c: "water", svg: `<path class="b" d="M150 124 L204 130 C214 156 176 176 172 200 C168 224 196 242 222 258 L150 258 C124 242 108 222 112 198 C116 170 158 150 150 124 Z"/>` },
    { c: "water", svg: `<path class="a" d="M14 264 C70 240 290 240 346 264 C300 292 60 292 14 264 Z"/>` },
    // 연잎 초록 8-11
    { c: "green", svg: pad(82, 270, 50, 17, -4) },
    { c: "green", svg: pad(286, 272, 50, 16, 5) },
    { c: "green", svg: `<g><circle class="b" cx="286" cy="66" r="16"/><circle class="b" cx="322" cy="64" r="17"/><circle class="a" cx="304" cy="52" r="20"/><circle class="a" cx="296" cy="76" r="13"/><circle class="a" cx="316" cy="78" r="12"/></g>` },
    { c: "green", svg: pad(150, 290, 30, 9, 0) },
    // 돛배 노랑 12-15
    { c: "yellow", svg: `<circle class="a" cx="44" cy="38" r="17"/>` },
    { c: "yellow", svg: `<g><ellipse class="a" cx="180" cy="218" rx="15" ry="6.5"/><circle class="b" cx="174" cy="217" r="1.8"/><circle class="b" cx="181" cy="215" r="1.8"/><circle class="b" cx="187" cy="218" r="1.8"/></g>` },
    { c: "yellow", svg: `<g><ellipse class="a" cx="64" cy="203" rx="9" ry="4"/><ellipse class="a" cx="300" cy="196" rx="10" ry="4.2"/></g>` },
    { c: "yellow", svg: `<g><path class="a" d="M96 72 L124 72 L127 112 L93 112 Z"/><path class="b" d="M95 84 L125 84 L125.5 87 L94.8 87 Z M94.2 98 L126.2 98 L126.4 101 L94 101 Z"/></g>` }
  ];

  function garden(states, just) {
    // states: array(16) of "off" | "on" | "miss"
    const pc = i => {
      const st = states[i] || "off";
      const cls = `pc c-${PIECES[i].c} ${st === "off" ? "off" : "on"}${st === "miss" ? " miss" : ""}${just === i ? " just" : ""}`;
      return `<g class="${cls}">${PIECES[i].svg}</g>`;
    };
    const stem = "#F6C4DA";
    return `<svg viewBox="0 0 360 304" role="img" aria-label="모은 색으로 채워지는 두물머리 정원 그림">
            ${pc(12)}
      ${pc(4)}${pc(5)}${pc(6)}
      <ellipse cx="304" cy="100" rx="48" ry="12" fill="#DCDDE6"/><ellipse cx="304" cy="96" rx="44" ry="8" fill="#EDEEF3"/>
      <path d="M298 96 C296 86 292 80 286 72 M304 96 L304 60 M310 96 C314 86 318 80 322 70" stroke="#EDA9C8" stroke-width="5" stroke-linecap="round" fill="none"/>
      ${pc(10)}
      <path d="M78 118 L142 118 L132 133 L88 133 Z" fill="#F3C4D9"/>
      <path d="M110 64 L110 118" stroke="#E7A9C4" stroke-width="3" stroke-linecap="round"/>
      ${pc(15)}
      ${pc(7)}
      <path d="M180 238 C182 262 178 284 180 304 M64 214 C60 250 70 276 74 304 M300 208 C306 244 290 276 294 304 M244 156 C238 210 250 250 236 304" stroke="${stem}" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${pc(8)}${pc(9)}${pc(11)}
      ${pc(3)}${pc(1)}${pc(2)}${pc(0)}
      ${pc(13)}${pc(14)}
    </svg>`;
  }

  /* 작은 아이콘들 */
  const icon = {
    leaf: (c = "#45A577") => `<svg class="leaf" viewBox="0 0 36 36" aria-hidden="true">${pad(18, 19, 15, 13, 0).replace(/class="a"/, `fill="${c}"`).replace(/class="v"/g, 'stroke="#F58DBF" stroke-width="1.1" fill="none"')}</svg>`,
    bloom: (c = "#EE3E92", c2 = "#F58DBF") => `<svg class="bloom" viewBox="-24 -46 48 50" aria-hidden="true">${[-66, -33, 33, 66].map(a => `<path d="${PETAL}" fill="${c2}" transform="rotate(${a}) scale(.9)"/>`).join("")}${[-16, 16].map(a => `<path d="${PETAL}" fill="${c}" transform="rotate(${a}) scale(.8)"/>`).join("")}<path d="${PETAL}" fill="${c2}" transform="scale(.82,.7)"/><ellipse cx="0" cy="-12" rx="7" ry="3" fill="#FDC470"/></svg>`,
    bud: () => `<svg viewBox="-16 -40 32 44" aria-hidden="true"><path d="M0 0 C-12 -10 -11 -30 0 -38 C11 -30 12 -10 0 0Z" fill="#EE4A98"/><path d="M0 0 C-13 -4 -16 -16 -14 -24 C-7 -16 -4 -9 0 0Z" fill="#F9B6D5"/><path d="M0 0 C13 -4 16 -16 14 -24 C7 -16 4 -9 0 0Z" fill="#F9B6D5"/><path d="M0 0 L0 4" stroke="#45A577" stroke-width="3"/></svg>`,
    stage: (n, on) => {
      // 1~5단계: 봉오리에서 만개까지
      const c = on ? "#EE4A98" : "#C9D9D4", c2 = on ? "#F9B6D5" : "#E3ECE9";
      const sets = [[0], [-14, 14], [-30, 0, 30], [-50, -18, 18, 50], [-72, -40, -12, 12, 40, 72]];
      const scale = [.62, .72, .8, .88, .95][n - 1];
      const petals = sets[n - 1].map((a, i) => `<path d="${PETAL}" fill="${i % 2 ? c : c2}" transform="rotate(${a}) scale(${scale})"/>`).join("");
      const center = n >= 4 ? `<ellipse cx="0" cy="-12" rx="${n === 5 ? 8 : 6}" ry="3" fill="${on ? "#FDC470" : "#E9EFEC"}"/>` : "";
      return `<svg viewBox="-34 -46 68 52" aria-hidden="true">${petals}${center}<path d="M0 0 L0 6" stroke="${on ? "#45A577" : "#C9D9D4"}" stroke-width="3"/></svg>`;
    },
    garden: () => `<svg viewBox="-24 -46 48 50" aria-hidden="true"><path d="${PETAL}" fill="#F47AB3" transform="rotate(-40) scale(.8)"/><path d="${PETAL}" fill="#3FA9B4" transform="rotate(40) scale(.8)"/><path d="${PETAL}" fill="#45A577" transform="rotate(-10) scale(.8)"/><path d="${PETAL}" fill="#FDC470" transform="rotate(12) scale(.74)"/></svg>`
  };

  const kindIcon = {
    choice: c => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12 L10 3.2 A9 8 0 1 0 14 3.2 Z" fill="${c}"/></svg>`,
    ox: c => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3 C6 10 10 12 12 14 C14 12 18 10 20 3" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M12 14 L12 21" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/></svg>`,
    word: c => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="${c}"/><circle cx="8" cy="10" r="2" fill="#fff"/><circle cx="14" cy="8" r="2" fill="#fff"/><circle cx="15" cy="14" r="2" fill="#fff"/><circle cx="9" cy="16" r="2" fill="#fff"/></svg>`,
    dial: c => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="${c}" stroke-width="2.4" fill="none"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" stroke="${c}" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="${c}"/></svg>`,
    calendar: c => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="4" stroke="${c}" stroke-width="2.4" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><circle cx="15.5" cy="15.5" r="2.4" fill="${c}"/></svg>`,
    pair: c => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="6.5" fill="${c}" opacity=".55"/><circle cx="15" cy="12" r="6.5" fill="${c}"/></svg>`,
    palette: c => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 C12 2.5 5 10.5 5 15 A7 7 0 0 0 19 15 C19 10.5 12 2.5 12 2.5Z" fill="${c}"/></svg>`
  };
  const kindName = {
    choice: "연잎 고르기", ox: "물길 정하기", word: "연밥 낱말", dial: "물레 숫자",
    calendar: "달력 꽃심기", pair: "두 빛 고르기", palette: "돛 물들이기"
  };

  function boat(sail = "#FDC470", stripes = "#F6A93B") {
    return `<svg viewBox="0 0 120 110" aria-hidden="true">
      <path d="M58 6 L58 84" stroke="#E07BA8" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M58 10 L28 82 M58 10 L92 82" stroke="#F3B8D3" stroke-width="1.6"/>
      <path class="sail" d="M40 14 L78 14 L81 72 L37 72 Z" fill="${sail}"/>
      <path d="M39 28 L79 28 M38.6 43 L79.6 43 M38.2 58 L80.4 58" stroke="${stripes}" stroke-width="2.6"/>
      <path d="M8 80 L112 80 L96 104 L24 104 Z" fill="#F068A6"/>
      <path d="M8 80 L112 80 L109 85 L11 85 Z" fill="#F7A6CB"/>
    </svg>`;
  }

  window.TourArt = { COLOR, garden, icon, kindIcon, kindName, boat, PIECES };
})();
