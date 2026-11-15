# Bright Roots Dental: Front Desk

A chat page where patients ask the clinic questions, and a staff page where the team handles anything the chat can't answer.

- **Patient chat:** `/`
- **Staff page:** `/staff`
- It needs no extra packages. Node 18 or newer is all you need.

## Run it on your computer

1. Install Node.js (version 18 or newer) from nodejs.org.
2. Open a terminal in this folder and type: `npm start`
3. Open `http://localhost:3000` for the chat and `http://localhost:3000/staff` for the staff page.

To check everything works, type `npm test`. It runs all the practice questions with no AI, and again with fake AIs that lie, say yes to everything, or are switched off.

## Add an AI key (optional)

The chat works fully with no key. A key only makes replies warmer.

1. Copy `.env.example` to a file named `.env`.
2. Fill in **one** option:
   - Google Gemini free tier: `GEMINI_API_KEY=...` (get a key at aistudio.google.com). Check the current free model name in Google AI Studio and put it in `GEMINI_MODEL`.
   - DeepSeek or Z.ai: `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.
3. Restart with `npm start`.

The key stays on the server. It never appears in the page code.

**How the AI is kept honest:** every AI reply is checked before the patient sees it. The app throws the AI reply away and answers from the clinic file if the reply:
- has a number that isn't in the clinic file,
- is missing the price or time the clinic file has,
- is vague, names a medicine or promises a discount.

Emergencies, symptoms, "ignore your rules", discounts and bookings never go to the AI at all.

## Put it online (Render, free)

1. Put this folder in a GitHub repository. `.env` is not uploaded. That is on purpose.
2. On render.com: **New, Web Service**, then pick the repository.
3. Build command: leave it empty. Start command: `npm start`.
4. Under **Environment**, add your `GEMINI_API_KEY` (and `GEMINI_MODEL`).
5. Your links: `https://FILL IN.onrender.com/` and `https://FILL IN.onrender.com/staff`

Note: on Render's free plan, tickets are wiped when the app restarts. That is fine for training. For a real clinic, add a disk and set `DATA_DIR` to its path.

## What the tester checks, and where it is

| Check | Where |
|---|---|
| Chat box and send button | `#chat-input`, `#chat-send` |
| Bot replies | every reply has class `bot-msg`, and the last one is the answer |
| Ask on load | `/?q=your question` asks it as soon as the page opens, in a fresh chat |
| Ticket list | `#ticket-queue`, one `[data-ticket]` per ticket, with `data-status` set to `answered`, `needs human`, `urgent` or `closed` |
| Staff reply | `#staff-reply` and `#staff-send` on each ticket. The reply shows up in that patient's chat within 4 seconds |
| No key run | without a key, every reply comes from the clinic file and is labelled "Answered from clinic file" |
| Phone, 375 px | tested at 375 px wide with no sideways scrolling |

## Bonus items (all 6 done)

- **Hindi and Telugu:** the chat replies in the language the patient writes in. Prices, times and names stay exactly as the clinic file writes them.
- **Booking becomes a ticket with a time:** "Book a cleaning tomorrow at 11 am" makes a ticket for that time. The chat checks the time against clinic hours, and there is also a short booking form.
- **Ticket ageing and priority:** P1 urgent, P2 bookings, P3 questions. Each ticket has a bar that fills up over the "2 working hours" callback promise. A question that waits too long moves up to P2 and is marked "Past callback time".
- **Clinic data editable by staff:** in the "Clinic details" tab, as a form or as JSON. There is also a "Restore original" button.
- **Quick-reply buttons:** under the chat, in all three languages.
- **Replies stay right after a staff edit:** the chat reads the clinic file fresh for every message. Tested: change Saturday hours, ask again, and the new hours come back.

## Extras I added (please check)

- **A day strip** at the top of the chat shows today's open hours, the lunch break and the time now ("Open now, closes 8:00 pm").
- **Contact form:** when a ticket opens, the patient is asked for a name and phone number, so staff can call back.
- **Staff helpers:** reply templates, "Draft reply" (AI or clinic file), "Confirm booking", and a sound and pop-up for new urgent tickets.
- **Checks tab:** runs 48 test questions in one click: your 8 plus 40 I wrote. Run it after every clinic edit.
- **Optional staff PIN:** set `STAFF_PIN`. Leave it blank while the tester checks `/staff`.
- **Open in Maps** link on the address reply, and a tap-to-call button on emergency replies.

## Files

- `server.js`: the web server and all its routes
- `lib/engine.js`: the answer rules (emergency, symptoms, booking, clinic facts)
- `lib/text.js`: reply sentences in English, Hindi and Telugu
- `lib/ai.js`: the optional AI call
- `lib/store.js`: saves tickets and the clinic file on disk
- `data/clinic.json`: the live clinic file. `clinic.original.json` is the backup
- `data/sample-questions.json`, `data/extra-questions.json`: test questions
- `public/`: the two pages
