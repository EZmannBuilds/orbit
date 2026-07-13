export function buildActiveChartContext({ activeChart = null, currentSky = "", detailLevel = "" } = {}) {
  const lines = [];
  if (activeChart) {
    const firstName = activeChart.first_name ? ` for ${activeChart.first_name}` : "";
    const birthplace = activeChart.birthplace_name ? ` Birthplace: ${activeChart.birthplace_name}.` : "";
    lines.push(
      `Active chart${firstName}: ${activeChart.nickname}. Sun ${activeChart.summary?.sun || "unknown"}, Moon ${activeChart.summary?.moon || "unknown"}, Rising ${activeChart.summary?.rising || "unavailable"}.${birthplace}`
    );
  }
  if (currentSky) lines.push(`Current sky: ${currentSky}`);
  if (detailLevel) lines.push(`Astrology detail level: ${detailLevel}.`);
  return lines.join("\n");
}
