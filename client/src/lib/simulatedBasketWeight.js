// Display helper for the simulated weight panel (demo only, no real scale).

export function formatIntegerGrams(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return `${n.toLocaleString('en-GB')} g`;
}

export function simulatedWeightPanelView(summary) {
  if (!summary || summary.available !== true) {
    return {
      state: 'unavailable',
      title: 'Simulated basket weight — demonstration only',
      heading: 'Not recorded for this session',
      detail:
        'Older sessions and sessions created with the demonstration disabled have no simulated weight.',
      explanation: 'Calculated using fictional product weights. No scale is connected.',
    };
  }

  const known = formatIntegerGrams(summary.knownGrams);
  const complete = summary.coverageComplete === true && known;
  const lines = `${summary.knownLineCount} of ${summary.totalLineCount} product lines`;
  const units = `${summary.knownUnitCount} of ${summary.totalUnitCount} basket units`;

  return {
    state: complete ? 'complete' : 'partial',
    title: 'Simulated basket weight — demonstration only',
    heading: complete ? 'Simulated total' : 'Known simulated-weight subtotal',
    amount: known,
    coverage: `Coverage: ${lines}; ${units}.`,
    explanation: 'Calculated using fictional product weights. No scale is connected.',
  };
}
