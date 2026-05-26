import { Link } from "react-router-dom";

/**
 * Read-only preview page for the future Sales messaging feature.
 *
 * No live functionality — this page exists to communicate the design
 * direction so the team can sanity-check it before we wire anything up.
 */
export default function Sales() {
  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Sales · Preview</div>
        <div className="flex-1" />
        <span className="text-[9px] uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-semibold">
          Coming soon
        </span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-sai-bluepale/60 border border-sai-blue/30 rounded-md p-5">
          <div className="text-[12px] uppercase tracking-wider font-semibold text-sai-blue mb-2">
            👋 What this page will become
          </div>
          <p className="text-[13px] text-slate-700 leading-relaxed">
            The Sales app turns the Proposals pipeline into a collaborative workspace.
            Today the pipeline shows your deals — soon it will also be where the team
            talks about them, gets nudged when something needs attention, and shares
            wins.
          </p>
        </div>

        <Section
          title="1 · Internal team chat per opportunity"
          icon="💬"
          body={
            <>
              Every opportunity already has a Chatter pane (Message / Log note / Activity log).
              The Sales app extends that so a message posted on an opportunity also
              <strong> shows up in a team-wide feed</strong> on this page — a single inbox
              where you see what's happening across all live deals without opening each card.
            </>
          }
          mock={
            <MockChatRow author="Vernon" initials="VV" body="Site Offices – Shutdown 2026: client asked for 6-month rental terms. Bumped delivery_weeks → 4. @Naledi can you cost the extended rental?" age="2 min" />
          }
        />

        <Section
          title="2 · @-mention salespeople"
          icon="🏷️"
          body={
            <>
              Typing <code className="bg-slate-100 px-1 rounded text-[11px]">@Naledi</code> in
              any opportunity Chatter pulls from the HR sales-team directory and creates a
              notification for that person. Their initials light up in the top nav with an
              unread badge.
            </>
          }
          mock={
            <div className="flex items-center gap-3 text-[12px]">
              <div className="h-7 w-7 rounded-full bg-sai-blue text-white text-[10px] font-bold flex items-center justify-center">NM</div>
              <div className="text-slate-700">
                <strong>Naledi Mokoena</strong> was mentioned on <em>Modular Clinic Extension</em>
                <span className="block text-[10px] text-slate-400">about 4 minutes ago · open ↗</span>
              </div>
            </div>
          }
        />

        <Section
          title="3 · Stage-change auto-posts"
          icon="🔔"
          body={
            <>
              When an opportunity moves Stage on the Kanban (e.g. <em>Qualified → Proposal Sent</em>),
              the activity log auto-posts the change and pings the salesperson assigned to the
              deal. No more silent stage moves the rest of the team only finds out about at month-end.
            </>
          }
          mock={
            <div className="text-[12px] text-slate-600 italic">
              <span className="text-[9px] uppercase tracking-wider bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold mr-2">Stage</span>
              Vernon moved <strong>Site Offices – Shutdown 2026</strong> from Qualified → Proposal Sent
            </div>
          }
        />

        <Section
          title="4 · Won-deal celebration & handoff"
          icon="🎉"
          body={
            <>
              When a deal moves to <strong>Won</strong>, the Sales feed posts a celebration card
              (with the deal value) and links to the auto-created Construction Project so the
              build-team handoff is a single click. The salesperson is credited on the card so
              attribution is visible to everyone.
            </>
          }
          mock={
            <div className="border border-emerald-300 bg-emerald-50 rounded-md p-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700">🎉 Deal won</div>
              <div className="font-semibold text-sai-navy mt-1">Modular Outpatient Clinic Extension · R 4 475 800</div>
              <div className="text-slate-600 mt-1">Closed by <strong>Vernon</strong> · construction project opened →</div>
            </div>
          }
        />

        <Section
          title="5 · Team leaderboard (light-touch)"
          icon="📈"
          body={
            <>
              A simple monthly view: total deal value won per salesperson, plus deals in the
              pipeline weighted by stage. Pulled from existing opportunity data — no extra
              data entry needed.
            </>
          }
          mock={
            <div className="grid grid-cols-3 gap-2 text-[12px]">
              <Stat label="Vernon" value="R 5.1M" sub="3 won · 2 in flight" />
              <Stat label="Naledi" value="R 2.8M" sub="1 won · 4 in flight" />
              <Stat label="Sipho" value="R 1.2M" sub="0 won · 3 in flight" />
            </div>
          }
        />

        <div className="bg-white border border-dashed border-slate-300 rounded-md p-5 text-[12px] text-slate-500">
          <div className="font-semibold text-sai-navy mb-1">Status</div>
          This page is a design preview only — none of the buttons above are wired up.
          The data model already covers most of it (Opportunity.salesperson, Activity log,
          Project handoff on win) so the lift to make it real is mostly UI + a small
          notifications table. Decide on scope and we'll plan a phase.
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, body, mock }: {
  title: string; icon: string; body: React.ReactNode; mock: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-ui-border rounded-md p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <div className="text-[14px] font-display font-bold text-sai-navy">{title}</div>
      </div>
      <p className="text-[13px] text-slate-700 leading-relaxed mb-3">{body}</p>
      <div className="bg-slate-50 border border-ui-border rounded p-3">
        <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Mock
        </div>
        {mock}
      </div>
    </div>
  );
}

function MockChatRow({ author, initials, body, age }: { author: string; initials: string; body: string; age: string; }) {
  return (
    <div className="flex gap-3 text-[12px]">
      <div className="h-7 w-7 rounded-full bg-sai-blue text-white text-[10px] font-bold flex-shrink-0 flex items-center justify-center">{initials}</div>
      <div className="flex-1">
        <div className="font-semibold text-sai-navy">{author} <span className="text-[10px] text-slate-400 font-normal ml-1">{age}</span></div>
        <div className="text-slate-700">{body}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string; }) {
  return (
    <div className="border border-ui-border rounded p-2 bg-white">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="text-[14px] font-display font-bold text-sai-navy">{value}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}
