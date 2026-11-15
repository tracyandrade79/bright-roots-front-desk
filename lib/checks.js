'use strict';
// Runs test questions through the engine without creating real tickets.
// Used by the staff "Checks" tab and by `npm test`.
const engine = require('./engine');

function judge(test, r) {
  const fails = [];
  const text = r.text || '';
  const low = text.toLowerCase();
  const kindOk = {
    answer: ['answer'].includes(r.kind) || (r.kind === 'refuse' && test.must_include),
    ticket: r.kind === 'ticket',
    no_advice: r.kind === 'no_advice',
    urgent: r.kind === 'urgent',
    refuse: r.kind === 'refuse',
    booking: r.kind === 'booking' && !!r.ticket,
  }[test.expect];
  if (!kindOk) fails.push(`expected "${test.expect}", got "${r.kind}"`);
  for (const s of test.must_include || []) if (!low.includes(String(s).toLowerCase())) fails.push(`missing "${s}"`);
  for (const s of test.must_not_include || []) if (low.includes(String(s).toLowerCase())) fails.push(`should not say "${s}"`);
  if (test.status && (!r.ticket || r.ticket.status !== test.status)) fails.push(`ticket status should be "${test.status}", got "${r.ticket ? r.ticket.status : 'no ticket'}"`);
  return fails;
}

async function runChecks(tests, data, ai) {
  const results = [];
  for (const test of tests) {
    let n = 0;
    const session = {};
    const ctx = {
      data, session, ai: ai || null,
      createTicket: (f) => ({ id: `T-TEST${++n}`, status: f.status }),
      saveContact: () => {},
    };
    let r;
    try { r = await engine.reply(test.q, ctx); } catch (e) { r = { kind: 'error', text: String(e) }; }
    const fails = judge(test, r);
    results.push({ q: test.q, expect: test.expect, pass: fails.length === 0, fails, reply: r.text, source: r.source, ticket: r.ticket ? r.ticket.status : null });
  }
  return { passed: results.filter((x) => x.pass).length, total: results.length, results };
}

module.exports = { runChecks, judge };
