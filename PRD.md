# VISION — Product Requirements Document (PRD)

**VIT Intelligent Surveillance & Identity Operations Network**
*A smart visitor and vehicle access management system for secure campus entry/exit monitoring using facial biometrics, faculty-approval workflows, and number-plate recognition.*

| | |
|---|---|
| **Prepared by** | Saptarshi — B.Tech CSE (Core), VIT-AP University (Reg. No. 24BCE7033) |
| **Document type** | Product Requirements Document |
| **Companion documents** | `VISION.md` (project source of truth — roles, decisions, architecture, status) · `Design.md` (UX flows, screen specs, data model, API contract) |
| **Source material** | `Review_1_ECS.docx` (Project Proposal – Review 1) + `VISION PoC Flow Overview` infographic |
| **Version** | 1.1 — role and authentication model revised |
| **Status** | Draft for team review |

> **Scope of this document.** It owns requirements: FR-IDs, NFRs, user stories, personas,
> KPIs and risks. The canonical role and authentication model lives in `VISION.md` §3; the
> screens, data model and API contract live in `Design.md`. This document states what must
> be true, not how it is built or why the stack was chosen.

---

## 0. How This Document Extends the Original Proposal

Your Review-1 proposal and the flow infographic already define a strong core: 7-stage flow, a normalized ER model, 4 functional modules, and a clear tech shortlist. This PRD keeps all of that intact and adds the layer a proposal document doesn't usually carry — personas, traceable requirements (FR-IDs), edge cases, RBAC, and a few structural decisions needed to make the spec buildable. Called out transparently, not buried:

| # | Addition / change | Why |
|---|---|---|
| 1 | Resolved the "student" ambiguity into a concrete rule (§4.3) | Proposal says both "digitally register visitors, parents, **faculty, and students** alike" *and* "monitors every **non-student** individual." Both are true simultaneously only if roles are split by function, not by who gets an account. |
| 2 | Split `Category` into `role` + `requester_type` + `visitor_subtype` | Your Scope section names Alumni, Vendors/Contractors, Guest Faculty/External Examiners as distinct stakeholders — the flat `Visitor` category in the ER diagram couldn't hold that. |
| 3 | Added a Student→Mentor mapping | Needed to auto-route parent visit requests, per your own rule: "for parents it'll be both mentor or faculty." |
| 4 | Added Watchlist/Blacklist as a first-class entity + flow | Your Problem Statement flags "fake identities... cannot always be accurately detected" and the infographic shows an "Access Denied & Alert" state with nothing behind it. |
| 5 | Added Notification and Audit Log entities | Implied by "real-time push notifications" and "automated audit report generation" in your Faculty/Admin modules, but not modeled anywhere. |
| 6 | Specified QR permits as signed/encrypted payloads, not plain codes | Your NFRs say "Encrypted QR Code Scanning" — this defines what that means concretely. |
| 7 | Specified biometric storage as encrypted embeddings, not raw images | Matches "stored as mathematical embeddings" (Workflow step 3) and is the only privacy-safe way to do offline matching. |
| 8 | Added an assisted/walk-in registration path | Closes a real gap: many parents and most vendors/delivery personnel won't pre-install an app. |
| 9 | Kept every ML/CV/backend/DB choice explicitly swappable | Per your instruction — the Review-1 stack is treated as a validated *shortlist*, not a lock-in. See §4.4. |
| 10 | Split authentication into two tracks — email + password for guests, employee ID + password for staff | An employee ID is the identifier the institution already keys on, and staff access is a fact about employment rather than something a person should be able to claim by signing up. See `VISION.md` §3. |
| 11 | Made "Student" mean an enrolled VIT-AP student, and moved visiting students from other institutions to a Visitor subtype | Such a visitor is functionally a guest of the campus and needs the same gate pipeline as any other guest; giving them a top-level role duplicated the visitor flow without adding anything. |

Nothing in the original proposal was removed — items 1–11 above are additive or clarifying. If any read as a wrong call, they're isolated enough to revert individually.

---

## 1. Executive Summary

VIT-AP, like most large campuses, currently manages the hundreds of parents, vendors, guest faculty, and other visitors who pass through its gates every day using handwritten registers, ID inspection, and phone calls to the concerned faculty member. This is slow at peak hours, unsearchable after the fact, unable to catch a fake or repeat-flagged identity, and blind to which vehicle is tied to which visit.

**VISION** replaces that with a mobile-first platform where a visitor or parent registers once (email + password, facial biometric, government ID), submits a visit request to the specific faculty/mentor they're there to see, and — once approved — receives a time-bound, QR-coded permit. At the gate, security verifies the person's face against the locally cached biometric template and validates the permit **entirely offline**, logs the vehicle's number plate automatically, and the system closes the loop with a matching exit scan. Every step is timestamped, searchable, and reportable.

The result the proposal targets: verification in seconds instead of minutes, a tamper-resistant digital trail instead of a paper register, and a system that keeps working even when the gate's internet connection doesn't.

---

## 2. Problem Statement

| Pain point (current manual process) | Consequence |
|---|---|
| Manual verification, handwritten registers, verbal ID checks | Long queues at peak hours (visiting weekends, event days) |
| Paper-based records | Near-impossible to search or retrieve after the fact |
| No reliable way to catch a fake/forged ID | Security vulnerability at the perimeter |
| No memory of repeat visitors | Guards re-verify from scratch every single time |
| Vehicle details not logged digitally | No cross-reference between a person and the vehicle they arrived in |
| Entry and exit not synchronized | No reliable answer to "who is currently on campus" |
| No real-time locating capability | Weak traceability during an emergency |
| Multiple gates, no shared view | Siloed monitoring, no campus-wide picture |
| Security must phone/intercom faculty to confirm a visit | Adds latency to every single visitor, every single time |

**Proposed solution (unchanged from Review-1):** a platform that digitally registers, verifies, authorizes, and monitors every non-student individual entering or exiting campus, tying a verified digital identity to an exact, timestamped visit history — online or offline.

---

## 3. Product Vision & Goals

> Every entry verified. Every visit accountable. Every gate operational, connection or no connection.

| Goal | What "done" looks like |
|---|---|
| Replace manual gate checks with biometric verification | Guard scans a face, gets a decision in under 2 seconds, no phone call needed |
| Digitize the approval chain | Faculty approve/reject from their phone; no visitor sits waiting for a callback |
| Make every visit auditable | Any past visit — who, when, why, whose guest, which vehicle — is searchable in seconds |
| Never go down at the gate | Verification works with zero connectivity; sync catches up when back online |
| Cut manual paperwork toward zero | No physical register required at any gate covered by the PoC |
| Give admins real visibility | Live dashboard of who's on campus, denied-entry attempts, and visit trends |

---

## 4. Scope

### 4.1 In Scope — PoC / MVP (single-campus, single-to-few-gate pilot)

- Self-registration + onboarding with guided facial biometric capture and government ID upload, for Visitors, Parents/Guardians, and Students — email + password credentials, with "Sign in with Google" as an optional convenience
- Admin-provisioned accounts for Faculty/Mentor, Security Staff, and Admin, authenticated by **employee ID + password** (see `VISION.md` §3 for the canonical role and credential model)
- Faculty/Mentor visit-request review, approve/reject with remarks
- Visit request creation with purpose, host/target-faculty selection, date/time window, optional vehicle details
- QR-coded, time-bound digital permits
- Vehicle capture and number-plate recognition (ANPR) at the gate, plus optional pre-registration
- Face-match + permit verification at entry and exit gates, **fully functional offline**
- Entry/exit logging with timestamps, face-match confidence, and vehicle linkage
- Periodic online↔offline sync of permits, revocations, and biometric templates to gate devices
- Notifications (request submitted / approved / rejected / permit issued / entry / exit / permit expiring / security alert)
- Reports & analytics dashboard for Security and Admin
- Admin console: user management, faculty directory, gate/device management, role-based access control, audit log
- Manual override at the gate (with mandatory remarks + officer attribution) for edge cases
- Blacklist/watchlist flag with automatic denial + alert

### 4.2 Out of Scope — for this PoC (explicitly deferred, see §13 for phasing)

- Replacing existing student/staff ID-card access systems
- Hostel entry and mess-slip verification integration (named in Review-1 as *future* extensibility)
- Full student attendance management
- Multi-campus / multi-institution deployment
- Payment or visitor-fee handling
- Physical barrier/turnstile actuation (documented as an optional hardware add-on, not required for the PoC — see `Design.md` §7)
- Government eKYC / UIDAI Aadhaar authentication (the app stores a **photo of an ID document as proof**, the same way a visitor register or front-desk copy would — it does not perform Aadhaar number verification against UIDAI. See `Design.md` §9 for why that distinction matters.)

### 4.3 Assumptions — read this section carefully, it resolves the one real ambiguity in the source material

The proposal states two things that only work together if read precisely:

1. *"Digitally register visitors, parents, **faculty, and students** alike under a single architecture."*
2. *"...monitors every **non-student** individual entering or exiting campus."* (also stated identically as the infographic's Objective, and the Offline Verification Flow is explicitly labeled "Scan Face (**Visitor/Parent**)")

**Resolution used throughout this PRD and Design.md** (canonical definition: `VISION.md` §3):

- **Who gets an account:** all six roles — Visitor, Parent/Guardian, Student, Faculty/Mentor, Security Staff, Admin — matching (1). They divide into two authentication tracks, not one.
- **Who self-registers:** Visitor, Parent/Guardian, and Student, with email + password. Faculty, Security and Admin are **provisioned by an admin** against an employee ID and never self-register; an institutional account is a fact about employment, not something a person claims for themselves.
- **Who is biometrically tracked through the entry/exit gate pipeline:** Visitor and Parent/Guardian only, matching (2) and the infographic's own gate-flow label ("Scan Face (Visitor/Parent)"). VIT-AP students, faculty, security and admin already hold institutional access (ID cards, hostel systems) that is explicitly out of scope for this PoC — this system does not duplicate or replace that.
- **"Student" means an enrolled VIT-AP student.** Their account exists for one active function: **sponsoring a visit** for a parent or guardian, which pre-fills the request and routes it to the student's assigned mentor. They are not gate-scanned.
- **Students from other institutions** — visiting for projects, internships, research collaboration or academic exchange under faculty supervision — are a **Visitor subtype** (`external_student`), not a separate role. They are functionally guests of the campus and need the same biometric gate pipeline as any other visitor. Their profile still carries home institution, project/internship details, and the supervising VIT-AP faculty member who approves their access.
- **Faculty accounts exist for exactly one active function in this PoC:** reviewing and approving/rejecting requests where they are the target/host. They are not gate-scanned.

If the gate scope needs to widen later — e.g. if students should be gate-tracked too — every module below is designed so a role can be added to the gate pipeline without a schema change; only the verification-flow enablement flag would need to flip. Flagged again in §14 Open Questions.

### 4.4 Technology Approach — deliberately kept flexible

**No ML/DL/CV model, backend framework, or database in this document is a requirement — each is a validated starting shortlist to prototype against and swap freely.** The Review-1 proposal's stack (FastAPI/Node+Express, Turso/Firestore, OpenCV+FaceNet/ArcFace, MediaPipe/RetinaFace, YOLOv11+EasyOCR, ZXing, Firebase) is carried forward as the reference shortlist in `Design.md` §7, with trade-offs noted where the two source documents actually disagreed (e.g., relational DB vs. Firestore, given the schema is heavily relational). Nothing here should be read as locking in a specific model or vendor.

Two items are **no longer open**, and are recorded as decisions rather than options:

- **Mobile framework: React Native + Expo.** Flutter was evaluated and rejected — see `VISION.md` ADR-001 for the reasoning and for the conditions that would reopen it.
- **Identity provider: Firebase Authentication**, for all three credential paths — see `VISION.md` ADR-002 and ADR-003.

### 4.5 Constraints

- **Budget:** near-zero — Review-1 targets ₹800–1,000 total outlay, relying on free tiers and open-source libraries. Any tool choice should default to a free/open-source option first.
- **Connectivity:** gate devices cannot assume internet access at the moment of verification — this is a hard constraint, not a nice-to-have (see NFR-AVAIL-01).
- **Device economics:** client devices should be assumed to be mid/low-range Android phones for visitors, since app adoption depends on it working on what people already own.
- **Timeline:** a 12-week academic build cycle (Review-1 §12) — see §13 Roadmap.

---

## 5. Stakeholders & User Roles

Roles split into two authentication tracks: guests of the campus, who **self-register with an email address and a password**, and members of the institution, who are **provisioned by an admin and sign in with an employee ID and a password**. The canonical definition of this model lives in `VISION.md` §3; the table below is the requirements-side view of it.

| Role | Who they are | Signs in with | Account created by | Primary goal in the system |
|---|---|---|---|---|
| **Visitor** | General public, alumni, vendors/contractors/maintenance personnel, guest faculty/external examiners, students visiting from other institutions | Email + password *(Google optional)* | Self-signup | Get on campus quickly and legitimately for a specific, approved purpose |
| **Parent / Guardian** | Parents or guardians of enrolled students | Email + password *(Google optional)* | Self-signup | Visit their ward with minimal friction, recognized on sight on repeat visits |
| **Student** | Enrolled VIT-AP students | Email + password *(Google optional)* | Self-signup, institutional email | Sponsor a parent or guardian's visit in a few taps, without a phone call to their mentor |
| **Faculty / Mentor** | VIT-AP faculty, including assigned student mentors | **Employee ID + password** | Admin-provisioned | Approve or reject visits quickly, with enough context to decide confidently |
| **Security Staff** | Gate operators | **Employee ID + password** | Admin-provisioned | Verify identity and permit in seconds, even offline; flag anomalies |
| **Admin** | Campus administration / IT | **Employee ID + password** | Seeded, then admin-provisioned | Full oversight — users, gates, faculty directory, reports, audit trail |

**Gate-tracked roles:** Visitor and Parent/Guardian only. Students, faculty, security and admin hold institutional access already and are not scanned at the gate (§4.3).

**Visitor sub-types** (`visitor_subtype`): General/Guest, Alumni, Vendor/Contractor/Maintenance, Guest Faculty/External Examiner, and External Student. This drives which fields are relevant on the visit-request form — a vendor needs a company name; a guest faculty or external student needs a home-institution field, and an external student additionally carries project/internship details and a supervising faculty member for approval routing. See `Design.md` §5.2.

---

## 6. User Stories

### Visitor
- As a visitor, I want to sign up with my email address and a password so I control my own account and can get back into it if I change phones.
- As a visitor, I want to register once with my face and ID so I don't have to re-verify from scratch on every future visit.
- As a visitor, I want to submit a visit request naming the specific faculty I need to see, so approval routes to the right person without a phone call.
- As a visitor, I want to see my request status (submitted / under review / approved / rejected) so I know whether to head to campus.
- As a visitor, I want my approved permit available offline in the app, so a weak signal at the gate doesn't block me.
- As a visitor, I want to add my vehicle details before I arrive, so the gate check is faster.

### Parent / Guardian
- As a parent, I want to select which of my children (students) I'm visiting, so the right mentor is automatically notified.
- As a parent, I want the option for either my child's mentor or another faculty member to approve my visit, since mentors aren't always available.
- As a parent, I want to be recognized instantly on repeat visits without re-registering.

### Student (VIT-AP)
- As a student, I want to sign up with my institutional email address so the system recognises me as an enrolled student without a manual approval step.
- As a student, I want to sponsor my parent's visit from my own phone, so they don't have to work out which faculty member to name.
- As a student, I want a sponsored request to route to my assigned mentor automatically, so I don't have to look the mentor up.
- As a student, I want to see the status of the visits I've sponsored, so I can tell my parents whether to set off.

### Visiting student from another institution
*(a Visitor with `visitor_subtype: external_student` — see §4.3)*
- As a visiting student, I want to register for a project/internship visit under a VIT-AP faculty member, so I can gain authorized access for my academic collaboration.
- As a visiting student, I want to specify my home institution, project duration, and supervising faculty, so my access is properly scoped and tracked.
- As a visiting student, I want to see my active project permit and visit history, so I know my access status at any time.

### Faculty / Mentor
- As a faculty member, I want to sign in with my employee ID rather than a personal email address, because my employee ID is the identifier the institution already knows me by.
- As a faculty member, I want to receive a push notification the moment someone requests to visit me, so I'm not the bottleneck.
- As a faculty member, I want to see the visitor's profile (photo, purpose, ID type, category) before I approve, so I'm deciding with real context.
- As a mentor, I want to see which of my advisees a parent visit request is linked to, so I have context even if I'm not the one who ends up approving.
- As a faculty member, I want a history of everyone I've approved or rejected, in case it's needed later.

### Security Staff
- As a security officer, I want to sign in with my employee ID and password at the start of a shift, so the gate device knows who is operating it and every action is attributable to me.
- As a security officer, I want to scan a face and get an access decision in under 2 seconds, with or without internet.
- As a security officer, I want the permit QR check and the face check to both pass before I grant access — not just one.
- As a security officer, I want a manual override option for edge cases, but I want it to require my ID and a reason, so it's still accountable.
- As a security officer, I want an audible/visual alert if someone on the watchlist attempts entry.
- As a security officer, I want to know at a glance whether my gate device's local data is stale, so I know if I need to reconnect it.

### Admin
- As an admin, I want to create faculty, security and admin accounts against their employee IDs, so institutional access is granted deliberately rather than claimed by whoever signs up first.
- As an admin, I want to deactivate a staff account immediately when someone leaves or changes role, so their gate and approval access ends the same day.
- As an admin, I want a live view of who is currently on campus, for both routine oversight and emergencies.
- As an admin, I want to search and export the full entry/exit history by date, gate, category, or person.
- As an admin, I want to manage the faculty directory and gate device list from one console.
- As an admin, I want an audit trail of every approve/reject/override/blacklist action, with who did it and when.

---

## 7. Functional Requirements

Priority uses MoSCoW: **M**ust / **S**hould / **C**ould.

### 7.1 Onboarding & Identity (FR-REG)

| ID | Requirement | Priority |
|---|---|---|
| FR-REG-01 | Visitor, Parent/Guardian and Student can self-register with an email address and a password. Password minimum 8 characters with a strength indicator; confirmation field required | Must |
| FR-REG-01a | Email ownership is verified by a link sent to the address before a visit request can be submitted | Must |
| FR-REG-01b | "Sign in with Google" is offered as an optional alternative for self-registering roles. No feature depends on it, and it is never the only way in | Should |
| FR-REG-01c | Faculty, Security and Admin **cannot self-register**. Their accounts are provisioned by an admin (FR-ADM-06) and authenticated by employee ID + password | Must |
| FR-REG-02 | Self-registering user selects their role at signup: Visitor (+ subtype), Parent/Guardian, or Student. The server accepts only these three values regardless of what the client sends | Must |
| FR-REG-03 | Guided, hands-free facial biometric capture (multi-angle: frontal, left, right, plus a tilt or blink prompt), styled as a directional-guide flow similar to modern dating-app selfie verification — no large per-user model training required | Must |
| FR-REG-04 | System rejects capture on poor lighting, occlusion (mask/sunglasses/hat), or multiple faces detected, with inline guidance to fix and retry | Must |
| FR-REG-05 | Government ID photo capture/upload (Aadhaar, Voter ID, Driving Licence, Passport, or College ID for alumni/external students) — image only, no OCR/eKYC required for MVP | Must |
| FR-REG-06 | Consent screen: explicit opt-in for biometric data collection and processing, separate from general T&Cs | Must |
| FR-REG-07 | Profile form captures name and contact, plus role-specific fields — linked student for Parent, company for Vendor, registration number/program/year for Student. Email is already held from signup and is not re-asked | Must |
| FR-REG-08 | After 3 failed biometric capture attempts, offer an assisted/walk-in registration path at the security desk | Should |
| FR-REG-09 | A Visitor with `visitor_subtype: external_student` stores home institution, project/internship title, duration, and assigned supervising faculty (for approval auto-routing) | Must |
| FR-REG-10 | A Student registering with an institutional email domain is recognised as enrolled without a manual approval step; their assigned mentor is looked up from the faculty directory | Should |

### 7.2 Profile & Account Management (FR-PROF)

| ID | Requirement | Priority |
|---|---|---|
| FR-PROF-01 | User can view/edit their profile details post-registration | Must |
| FR-PROF-02 | User can re-run biometric enrollment (e.g., appearance change, repeated match failures) | Should |
| FR-PROF-03 | User can add/edit/remove saved vehicles | Must |
| FR-PROF-04 | Admin/Security can view (not self-edit) a user's verification status and flag history | Must |
| FR-PROF-05 | User can change their own password, re-entering the current one to confirm | Must |
| FR-PROF-06 | Self-registering user can reset a forgotten password via a time-limited link sent to their verified email address | Must |
| FR-PROF-07 | Staff password reset is **admin-initiated**, not self-service — an employee ID has no email address attached to it as a credential. The reset forces a password change on next sign-in | Must |
| FR-PROF-08 | Repeated failed sign-in attempts on one account lock it temporarily, and the lock is recorded | Must |
| FR-PROF-09 | Sessions expire and refresh automatically; signing out clears the session on the device completely, not only the local profile cache | Must |

### 7.3 Visit Request & Approval (FR-VIS)

| ID | Requirement | Priority |
|---|---|---|
| FR-VIS-01 | Requester creates a visit request: purpose, visit type, date, time window | Must |
| FR-VIS-02 | Visitor selects a "concerned faculty" from a searchable directory | Must |
| FR-VIS-03 | Parent selects a linked student (ward); mentor is auto-suggested as approver, with the option to pick any faculty instead | Must |
| FR-VIS-04 | Requester can attach vehicle details to the request | Should |
| FR-VIS-05 | Requester can cancel a request while it is still pending | Must |
| FR-VIS-06 | Faculty/Mentor receives a real-time notification on a new request targeting them | Must |
| FR-VIS-07 | Faculty/Mentor can view full requester context (photo, category, purpose, past visit history) before deciding | Must |
| FR-VIS-08 | Faculty/Mentor can approve or reject with an optional remark; remark is mandatory on rejection | Must |
| FR-VIS-09 | Requester is notified immediately on a status change | Must |
| FR-VIS-10 | Faculty/Mentor can view their own approval history | Should |
| FR-VIS-11 | Auto-reminder to Faculty/Mentor if a request is unanswered past a configurable SLA (e.g., 24h) | Could |

### 7.4 Permit & QR (FR-PMT)

| ID | Requirement | Priority |
|---|---|---|
| FR-PMT-01 | Approved request auto-generates a time-bound digital permit (valid_from / valid_until) | Must |
| FR-PMT-02 | Permit QR payload is cryptographically signed/encrypted to prevent forgery or replay | Must |
| FR-PMT-03 | Permit is cached client-side for offline display | Must |
| FR-PMT-04 | Faculty or Admin can revoke an active permit; revocation propagates to gate devices on next sync | Must |
| FR-PMT-05 | Expired or revoked permits are rejected at the gate even if the QR still scans successfully | Must |

### 7.5 Vehicle & ANPR (FR-VEH)

| ID | Requirement | Priority |
|---|---|---|
| FR-VEH-01 | Requester can pre-register vehicle (plate, type, model, color) during profile setup or request creation | Should |
| FR-VEH-02 | Gate camera captures the vehicle image and extracts the plate number via ANPR at entry and exit | Must |
| FR-VEH-03 | System flags a mismatch if the plate scanned differs from the one pre-registered for that request | Should |
| FR-VEH-04 | Manual plate entry fallback when OCR confidence is below threshold or plate is unreadable | Must |
| FR-VEH-05 | Vehicle type (2-wheeler / 4-wheeler / other) captured, self-declared or CV-classified | Could |

### 7.6 Gate Verification — Entry (FR-ENT)

| ID | Requirement | Priority |
|---|---|---|
| FR-ENT-01 | Security app captures a live face scan at the gate | Must |
| FR-ENT-02 | Face is matched against the locally cached biometric template store — must work fully offline | Must |
| FR-ENT-03 | Permit QR is scanned and validated locally (signature check + validity window + revocation-list check) | Must |
| FR-ENT-04 | Access is granted only if **both** face match and permit validity pass | Must |
| FR-ENT-05 | Access decision surfaces within 2 seconds of scan completion, with a clear visual + audible signal | Must |
| FR-ENT-06 | Entry log is created with timestamp, gate ID, face-match confidence, vehicle ID (if any), and captured image | Must |
| FR-ENT-07 | Security officer can manually override a denial, required to enter an ID/PIN and a reason; override is logged and flagged for admin review | Must |
| FR-ENT-08 | A watchlisted/blacklisted user attempting entry triggers an immediate alert to security and admin, regardless of permit status | Must |
| FR-ENT-09 | Walk-in visitor without a pre-existing account can be registered on-the-spot by security (assisted registration) | Should |

### 7.7 Gate Verification — Exit (FR-EXT)

| ID | Requirement | Priority |
|---|---|---|
| FR-EXT-01 | Face scan + optional vehicle capture at exit | Must |
| FR-EXT-02 | Exit is linked back to the specific entry session it closes | Must |
| FR-EXT-03 | Visit duration is computed and stored on session close | Should |
| FR-EXT-04 | Alert raised if an exit scan can't be matched to any open entry session | Should |

### 7.8 Offline Sync (FR-SYN)

| ID | Requirement | Priority |
|---|---|---|
| FR-SYN-01 | Gate device periodically syncs active permits, revocations, and biometric templates from the server when online | Must |
| FR-SYN-02 | Entry/exit logs and alerts captured offline are queued locally and uploaded once connectivity resumes | Must |
| FR-SYN-03 | Gate device UI shows sync status (last synced timestamp / stale-data warning) | Must |
| FR-SYN-04 | Conflict resolution rule defined for near-simultaneous updates (server state wins on reconnect; local logs are additive, never overwritten) | Must |

### 7.9 Notifications (FR-NOT)

| ID | Requirement | Priority |
|---|---|---|
| FR-NOT-01 | Push notification on: request submitted, approved, rejected, permit issued, entry logged, exit logged, permit expiring soon | Must |
| FR-NOT-02 | Security alert notification on denied access or blacklist match, sent to Security + Admin | Must |
| FR-NOT-03 | SMS/email fallback channel for users without reliable push delivery | Could |

### 7.10 Reports & Analytics (FR-RPT)

| ID | Requirement | Priority |
|---|---|---|
| FR-RPT-01 | Searchable/filterable visit history (by date, gate, category, person, faculty host) | Must |
| FR-RPT-02 | Exportable entry/exit logs (CSV at minimum) | Must |
| FR-RPT-03 | Dashboard: visits by day/category/gate, average visit duration, denied-entry attempts, peak hours | Should |
| FR-RPT-04 | "Who is currently on campus" live view (open entry sessions with no matching exit yet) | Should |

### 7.11 Admin & RBAC (FR-ADM)

| ID | Requirement | Priority |
|---|---|---|
| FR-ADM-01 | Admin manages user accounts (view, suspend, reactivate) | Must |
| FR-ADM-02 | Admin manages the faculty directory (add/edit department, designation, mentor assignments) | Must |
| FR-ADM-03 | Admin manages gates/devices (register, rename, deactivate) | Must |
| FR-ADM-04 | Role-based access control enforced across all modules — see `Design.md` §9 for the full permission matrix | Must |
| FR-ADM-05 | Full audit log of admin/security actions (approvals, overrides, revocations, blacklist changes) | Must |
| FR-ADM-06 | Admin provisions Faculty, Security and Admin accounts against an employee ID, setting role, department and an initial password | Must |
| FR-ADM-07 | Admin can deactivate a staff account, revoking gate and approval access immediately rather than at next token expiry | Must |
| FR-ADM-08 | Employee IDs are unique across the system, and a deactivated ID is not reissued to a different person | Must |
| FR-ADM-09 | A role is assigned only by the server, from the account record. A role value supplied by a client is ignored | Must |

### 7.12 Security & Trust (FR-TRU)

| ID | Requirement | Priority |
|---|---|---|
| FR-TRU-01 | Admin/Security can flag a user as blacklisted/watchlisted with a reason | Must |
| FR-TRU-02 | Blacklist flag auto-denies gate access and alerts, independent of any valid-looking permit | Must |
| FR-TRU-03 | Blacklist flag can be cleared by Admin, logged in the audit trail | Must |

---

## 8. Non-Functional Requirements

| Category | Requirement | Target |
|---|---|---|
| NFR-PERF-01 | Face-match + permit validation latency at the gate | < 2 seconds end-to-end (on-device/local) |
| NFR-PERF-02 | Notification delivery latency (when online) | < 5 seconds |
| NFR-PERF-03 | Permit generation after approval | < 5 seconds |
| NFR-AVAIL-01 | Gate verification must not depend on live connectivity | 100% of entry/exit decisions functional offline |
| NFR-AVAIL-02 | Sync latency for critical updates (revocations) once reconnected | < 2 minutes |
| NFR-SEC-01 | Biometric data stored as encrypted embeddings, never raw images used for matching | Enforced at storage layer |
| NFR-SEC-02 | All data encrypted in transit (TLS) and at rest | Enforced |
| NFR-SEC-03 | QR permits are signed/encrypted to resist forgery and replay | Enforced |
| NFR-SEC-04 | Passwords are stored only as salted one-way hashes (bcrypt or argon2). No plaintext, and no reversible encryption, anywhere in the system or in logs | Enforced at storage layer |
| NFR-SEC-05 | Every authenticated request is authorized against a server-issued role claim carried by a cryptographically verified token. An unverified or unsigned token is rejected outright — there is no fallback path that accepts one | Enforced at the middleware layer |
| NFR-SEC-06 | Authentication endpoints are rate-limited, and repeated failures lock the account temporarily | Enforced |
| NFR-ACC-01 | Face-match accuracy (empirically validated per chosen model, not a fixed promise) | Target guardrails: FAR ≤ 0.1%, FRR ≤ 3% at operating threshold |
| NFR-SCALE-01 | Architecture supports scale-out from single-gate pilot to full multi-gate campus without redesign | Design-time requirement |
| NFR-COMPAT-01 | Client app functions on mid/low-range Android devices | Primary target platform |
| NFR-USE-01 | Onboarding completable by a non-technical user (e.g., an older parent) without assistance in most cases | Usability target, validated via testing |
| NFR-PRIV-01 | Data retention and deletion policy defined and enforced (see `Design.md` §9) | Policy documented before pilot launch |
| NFR-MAINT-01 | Face recognition, ANPR, and detection models are swappable without touching the application layer (interface-based, not hardcoded) | Architectural requirement, per §4.4 |
| NFR-COST-01 | Preference for free-tier/open-source tooling given near-zero budget | Guiding constraint, not hard limit |

---

## 9. Data Requirements (Summary)

Thirteen entities: `User`, `Staff_Credential`, `Faculty_Profile`, `Student_Profile`, `Vehicle`, `Visit_Request`, `Visit_Permit`, `Gate`, `Entry_Log`, `Exit_Log`, `Watchlist_Flag`, `Notification`, `Audit_Log`. Full field-level schema, the entity-relationship diagram, and rationale for each addition relative to the original ER diagram are in **`Design.md` §6**.

---

## 10. System Overview (Summary)

Four layers: **Mobile App** (registration, profile, requests, permit display) → **Backend** (auth, approval workflow, biometric template store, sync orchestration) → **Database** (relational, given the schema above) → **Security Gate Device** (local offline DB, camera-based face + QR + ANPR capture, periodic sync). Full architecture, sync design, and technology trade-offs in **`Design.md` §7**.

---

## 11. Success Metrics / KPIs

| Metric | Why it matters |
|---|---|
| Median gate verification time (scan to decision) | Directly measures the queue-time problem this replaces |
| % of visits fully resolved without a manual override | Measures how much the automated pipeline is actually trusted/working |
| Faculty median response time to a visit request | Measures whether the approval bottleneck is actually solved |
| Offline verification success rate (gate decisions made with zero connectivity) | Validates the core reliability promise |
| False-reject rate observed in the field vs. NFR-ACC-01 target | Tracks whether the chosen face-match model is good enough in practice |
| Blacklist catch rate (flagged users correctly denied) | Validates the security-value proposition |
| % of registrations completed without security-desk assistance | Validates onboarding usability |

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Biometric spoofing (photo/video replay at the gate) | Multi-angle enrollment discourages naive spoofing; manual override with officer accountability as a fallback; consider basic liveness cues in a later phase |
| Gate connectivity failure mid-verification | Offline-first design is not optional — see NFR-AVAIL-01; local DB always holds the latest synced state |
| Biometric/PII data breach | Encrypted embeddings (not raw images) for matching, encryption in transit/at rest, strict RBAC, minimal retention window |
| Low parent/visitor tech literacy → poor adoption | Hands-free guided biometric UX, minimal text entry, assisted/walk-in registration fallback (FR-REG-08, FR-ENT-09) |
| False rejections causing gate friction | Manual override path with mandatory accountability logging (FR-ENT-07) |
| Faculty slow to respond, recreating the original bottleneck | SLA reminder (FR-VIS-11); consider auto-escalation in a later phase |
| Ambiguity in "student" scope (§4.3) turns out to be wrong | Design isolates the gate-enablement flag per requester type — reversible without a schema rewrite |
| Aadhaar/government-ID handling drawing regulatory scrutiny | System stores an ID **photo as proof only**, not Aadhaar-number verification/eKYC — see `Design.md` §9. For an actual production rollout beyond the academic PoC, get this reviewed against India's DPDP Act 2023 by someone qualified — this document is not legal advice. |

---

## 13. Roadmap & Milestones

### PoC build plan (aligned to Review-1 §11–12, 12-week academic cycle)

| Phase | Weeks | Focus |
|---|---|---|
| 1. Foundation | 1 | Literature survey, requirement finalization, tech selection |
| 2. Architectural Setup | 2 | Wireframes, DB schema, API blueprint |
| 3. Core Identity Pipeline | 3–5 | Auth, registration flows, face-matching engine |
| 4. Gate Automation | 6–7 | Faculty approval workflow, QR permits, ANPR integration |
| 5. Consolidation & Dashboards | 8–9 | Offline sync, admin reporting console |
| 6. QA & Rollout | 10–12 | Integration testing, performance tuning, documentation, demo |

### Beyond the PoC

| Phase | Scope |
|---|---|
| **Phase 2** | Multi-gate rollout on full campus; refined sponsor flow for students; auto-approval rules for pre-cleared recurring visitors (e.g., regular vendors); institutional SSO for staff, replacing employee ID + password if VIT-AP exposes one |
| **Phase 3** | Hostel entry + mess-slip verification integration (Review-1's own named future extensibility); host-initiated invites (faculty pre-registers an expected guest); integration with existing VIT ID-card systems |
| **Phase 4** | Full student attendance management; emergency evacuation headcount mode; multi-campus support |

---

## 14. Open Questions

1. Is the student-scope resolution in §4.3 correct, or should students also be gate-tracked?
1a. Should Student signup be restricted to a verified institutional email domain, or should any address be accepted with a manual verification step?
1b. Are employee IDs available in a format the system can validate (fixed length, checksum), and can an initial staff roster be imported rather than entered one account at a time?
2. Should faculty non-response auto-escalate to a department admin, or just remind the same faculty member?
3. Which government ID types should be accepted beyond Aadhaar — should the list be configurable by Admin?
4. What is the target data retention period for entry/exit logs and captured images before automatic purge?
5. Should security have a device-side kill switch to wipe cached biometric templates if a gate device is lost/stolen?
6. Is a physical barrier/turnstile actuator in scope for the PoC demo, or purely conceptual for now?

---

## 15. Appendix: Glossary

| Term | Meaning |
|---|---|
| ANPR | Automatic Number Plate Recognition |
| Custom claim | Role metadata attached to an account by the server and carried inside the verified token; the authoritative source for authorization decisions |
| Custom token | A short-lived token minted by the backend after it verifies an employee ID and password, exchanged by the app for a normal session — the bridge that lets employee-ID login share one token type with email login |
| Employee ID | The institutional staff identifier used as the sign-in credential for Faculty, Security and Admin |
| FAR / FRR | False Accept Rate / False Reject Rate — standard biometric accuracy metrics |
| Gate-tracked | Subject to biometric verification at entry and exit. Applies to Visitor and Parent/Guardian only |
| Permit | The time-bound, QR-coded authorization generated after faculty approval |
| Requester | Any account role that submits a visit request — Visitor, Parent/Guardian, or a Student sponsoring on a parent's behalf |
| Sponsor | A VIT-AP student initiating a visit request on behalf of a visiting parent or guardian |
| Watchlist / Blacklist | A flag on a user record that forces automatic gate denial + alert |
