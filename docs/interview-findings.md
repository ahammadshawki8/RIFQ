# What the interviews changed

Three conversations, 21 to 23 September 2026. Participants consented to being named in the competition submission, so this public repository refers to them by role only, and quotes only the lines they agreed we could use.

| # | Who | Where | Date |
|---|---|---|---|
| 1 | Head of Retail Collections & Special Asset Management | Retail bank, Bangladesh | 21 Sep 2026 |
| 2 | Manager, Early Warning Collections | Gulf banking group, Qatar | 23 Sep 2026 |
| 3 | Card customer, salary delayed two months | Dubai, UAE | 22 Sep 2026 |

## The assumption we got wrong

We went in thinking the hard part was **hearing hardship in the customer's language**. Build good multilingual speech recognition, catch "I lost my job", raise a ticket, done.

Both collections heads said the same thing without prompting: detection is the easy part.

> "The product is not the voice that detects hardship; it is the closed loop that stops collection pressure, transfers the context, and proves that a human took ownership."

> "If the AI only makes the call and raises a ticket, you have automated the easy part; the real product is suppression, ownership, and a completed human handoff."

The customer said it from the other side:

> "What would make me trust it is seeing the same case in my bank app and not having to explain myself again."

## What we changed in the product

| Before | After |
|---|---|
| Escalation raised a case | One escalation writes three things: the protected node, the contact hold, and a case with a **named owner and an SLA** |
| Suppression was a contact preference | One suppression list is the only source for the bank dialer **and** the agency file export, and blocked attempts are logged |
| The handoff carried a summary | It carries the transcript, the hardship reason and the customer's own words, so nobody starts from zero |
| Success meant a completed call | Success means a **completed handoff**, which is what the KPIs now measure |
| The customer heard an outcome | The customer **sees** the case, the reference and the written outcome in the bank app |

## Numbers they gave us

| Measure | Value | Source |
|---|---|---|
| Hardship signals reaching the right person on the same call | 20 to 30% | 30% (interview 1), 20% (interview 2), experience-based estimates |
| Hardship cases where the customer must explain again | 60 to 70% | about 60% (interview 1), 7 of 10 (interview 2). The customer in interview 3 explained five times |
| Collection calls checked against approved wording | 2 to 5% | 5 of 100 (interview 1), 2 of 100 (interview 2), routine manual sampling |

These are practitioner estimates, not audited statistics, and they are labelled that way in the submission.

## The timeline the customer lived

Payment due on the 7th. Overdue SMS on day 2. First collection call on day 4, then almost daily. He explained the delayed salary five times: two collectors, the complaints team, the assessor, and the agency that called around day 40. No transfer to a specialist during any call. Collection calls continued for three to four days after he complained. A written arrangement came 10 to 12 business days after the complaint.

Every stage of that timeline is a guardrail in this prototype.

## What we also added because they asked

Wrong-party handling, disputed amounts, complaints, requests for a person, opt-out synchronised across dialers, refusal to decide waivers or restructuring, low confidence routed to a person rather than guessed, explicit failure when a dependency is down, and a transcript the customer can be shown.

Still open, and honestly out of scope for the prototype: bereavement and serious illness routing, self-harm escalation, deceased and insolvency cases, customers represented by lawyers, and accent and dialect bias testing. Both bankers named these, and they belong in a pilot, with qualified people designing the routes.
