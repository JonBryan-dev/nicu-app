"use client";
// HomeVisiting — "Visiting Maisie, Jon and Katt at home": what the neonatal
// team ask of visitors once a premature baby is home. Based on Bliss and NHS
// guidance (hand hygiene, illness, RSV season, smoking, kissing, visitor
// vaccinations, cues and visit length); the unit's own discharge advice
// always comes first. Read by family, parents see what family are told.
import { useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";

function Rule({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="homerule">
      <span className="homerule-icon" aria-hidden="true">{icon}</span>
      <div>
        <div className="homerule-title">{title}</div>
        <div className="homerule-body">{children}</div>
      </div>
    </div>
  );
}

export default function HomeVisiting({ onRequest }: { onRequest?: () => void }) {
  const { supabase, family, isParent } = useFamily();
  const [parents, setParents] = useState<string[]>([]);
  const first = family.baby_name.split(" ")[0];

  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name, parent_kind")
      .eq("family_id", family.id)
      .eq("role", "parent")
      .order("parent_kind")
      .then(({ data }) =>
        setParents(((data as { display_name: string }[]) ?? []).map((p) => p.display_name.split(" ")[0]))
      );
  }, [supabase, family.id]);

  const who = parents.length === 2 ? `${parents[0]} and ${parents[1]}` : parents.length === 1 ? parents[0] : "Mum and Dad";

  return (
    <>
      <div className="card">
        <h2>Visiting {first}, {who} at home</h2>
        <p className="note">
          {first} was born very early, and her first winter at home is the one to be a bit careful in. She&apos;s had her RSV jab, which takes the edge off the biggest worry — so this isn&apos;t a fortress, just a few sensible asks from the neonatal team. None of them are about you; all of them are about her.
        </p>
        {!isParent && onRequest && (
          <button className="primary" onClick={onRequest} style={{ marginTop: 4 }}>
            🙋 Ask for a time to visit
          </button>
        )}
      </div>

      <div className="card">
        <h2>Before you come</h2>
        <Rule icon="🤧" title="Under the weather? Give it a miss this time">
          A cold, cough, sore throat, temperature, sickness or diarrhoea — her RSV jab doesn&apos;t cover any of those, and they land harder on her than on you. Come once you&apos;ve been well for <b>48 hours</b>. An active cold sore is the one hard no: that virus is genuinely dangerous to a baby.
        </Rule>
        <Rule icon="🏠" title="Someone unwell at yours?">
          Worth a quick message to {who} before you set off. A video call is always a good visit.
        </Rule>
        <Rule icon="💉" title="Jabs">
          Flu and COVID vaccines are recommended for people who&apos;ll be around a premature baby over winter. If you&apos;ll be a regular, ask your GP or pharmacist about the whooping cough vaccine too.
        </Rule>
        <Rule icon="📅" title="Arrange it first">
          A planned time beats a drop-in — her feeds and sleeps run to the clock, and {who} need to know who&apos;s coming. Use the Slots tab to book or ask for a time.
        </Rule>
      </div>

      <div className="card">
        <h2>When you arrive</h2>
        <Rule icon="🧼" title="Wash your hands — properly">
          Soap and water for 20 seconds as soon as you come in, before you touch her, and again after a nappy, a cough, or using your phone. There&apos;s hand gel by the door too.
        </Rule>
        <Rule icon="🚭" title="No smoke, no vape">
          Smoke on clothes and breath is a real risk to premature lungs. Please don&apos;t smoke or vape before you visit, and come in clean clothes if you&apos;ve been around smoke.
        </Rule>
        <Rule icon="💋" title="Kisses on hold for now">
          Not her face or hands, however tempting — this one&apos;s about cold-sore and tummy-bug germs, which the jab does nothing for. Cuddles are the thing.
        </Rule>
        <Rule icon="🧥" title="Coats off, phones away, perfume skipped">
          Outdoor layers off at the door. Phones carry a lot — wipe it or leave it in your pocket. Strong scents can bother her breathing.
        </Rule>
        <Rule icon="🫶" title="Cuddles — if invited">
          Let {who} hand her to you. If she&apos;s asleep or due a feed, the visit is the company, not the cuddle.
        </Rule>
      </div>

      <div className="card">
        <h2>While you&apos;re here</h2>
        <Rule icon="⏱" title="An hour is a good visit">
          A tired premature baby doesn&apos;t show it in the moment — it shows up as a rough night afterwards. Short and sweet, and come again soon.
        </Rule>
        <Rule icon="🤫" title="One voice, low light, no passing round">
          She copes best with calm. Watch for her saying &ldquo;enough&rdquo;: splayed fingers, looking away, yawning, hiccups, going floppy or stiff. When you see those, she&apos;s done.
        </Rule>
        <Rule icon="🍼" title="Her routine runs the day">
          Feeds and sleeps come first. If {who} say it&apos;s time, it&apos;s time — they won&apos;t mind you leaving, and they&apos;ll mind if you stay.
        </Rule>
        <Rule icon="🧒" title="Children">
          Very welcome when they&apos;re well, with an adult alongside. Nursery and school are where the winter bugs come from, so a snotty week is a week to wait.
        </Rule>
        <Rule icon="🐾" title="Pets">
          Not in the same room as her.
        </Rule>
      </div>

      <div className="card">
        <h2>Winter</h2>
        <p className="note">
          {first} has had her RSV jab, so the virus that puts most premature babies back in hospital over winter is largely covered. What it doesn&apos;t cover is everything else going round — colds, flu, COVID, tummy bugs — which is why the asks above are still worth keeping to. The simple test: <b>if you&apos;re not sure you&apos;re well, make it a video call this time</b>.
        </p>
        <Rule icon="👀" title="Worth telling them if you ever notice">
          Breathing fast or working hard (pulling in under the ribs or at the neck), going off her feeds, unusually sleepy or floppy, a high temperature. Blue or grey lips or face is <b>999</b> — but that&apos;s a just-so-you-know, not something to expect.
        </Rule>
      </div>

      <p className="muted" style={{ margin: "4px 2px 12px" }}>
        Based on Bliss and NHS guidance for premature babies at home. {first}&apos;s own team&apos;s advice always comes first — if they&apos;ve said something different, that wins.
      </p>
    </>
  );
}
