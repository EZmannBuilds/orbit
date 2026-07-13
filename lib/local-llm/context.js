export function buildActiveChartContext({ activeChart = null, currentSky = "", detailLevel = "" } = {}) {
  const lines = [];
  if (activeChart) {
    lines.push(
      `Active chart: ${activeChart.nickname}. Sun ${activeChart.summary?.sun || "unknown"}, Moon ${activeChart.summary?.moon || "unknown"}, Rising ${activeChart.summary?.rising || "unavailable"}.`
    );
  }
  if (currentSky) lines.push(`Current sky: ${currentSky}`);
  if (detailLevel) lines.push(`Astrology detail level: ${detailLevel}.`);
  return lines.join("\n");
}
