const [suite = 'requested', phase = 'a later phase'] = process.argv.slice(2);
console.error(
  `${suite} is not implemented until ${phase}. No checks ran; this is not a passing result.`,
);
process.exitCode = 2;
