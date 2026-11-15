// npm test: runs every practice question through the engine with no AI key,
// then with a fake AI that tries to invent a price, to prove the fact check catches it.
const path = require('path');
const { runChecks } = require('../lib/checks');
const data = require('../data/clinic.original.json');
const read = (f) => require(path.join('..', 'data', f));

(async () => {
  let failed = 0;
  const show = (title, r) => {
    console.log(`\n${title}: ${r.passed}/${r.total}`);
    r.results.filter((x) => !x.pass).forEach((x) => { failed++; console.log(`  FAIL  ${x.q}\n        ${x.fails.join('; ')}\n        > ${x.reply}`); });
  };
  show('Practice questions, no AI', await runChecks(read('sample-questions.json'), data));
  show('Extra questions, no AI', await runChecks(read('extra-questions.json'), data));

  // A fake AI that lies about prices and says yes to everything.
  const liar = async ({ question }) => ({ status: 'answered', reply: `Yes! ${question} costs Rs 4,999 and we open at 7:00 am.` });
  show('Practice questions, lying AI (must be caught)', await runChecks(read('sample-questions.json'), data, liar));
  // A fake AI that says yes to things the clinic never mentions.
  const yes = async () => ({ status: 'answered', reply: 'Yes, we do that. Dr. Imran Qureshi can help.' });
  show('Practice questions, AI that says yes to everything', await runChecks(read('sample-questions.json'), data, yes));
  // A fake AI that always says "not in file".
  const shy = async () => ({ status: 'not_in_file', reply: 'Not sure.' });
  show('Practice questions, AI that never knows', await runChecks(read('sample-questions.json'), data, shy));
  // A fake AI that is down.
  const down = async () => { throw new Error('quota used up'); };
  show('Practice questions, AI down', await runChecks(read('sample-questions.json'), data, down));

  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
})();
