"use client";

import { useState } from "react";
import { Check, Copy, Flame, MessageSquareText, Megaphone, ShieldQuestion } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MarketingReport } from "@/lib/schemas/report";

// ---------------------------------------------------------------------------
// The campaign package: copy-paste-ready drafts, each annotated with the sim
// finding or advisor directive it answers — that traceability is the point.
// Closes with the objection ledger and the PR pre-mortem.
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function AnswersFinding({ children }: { children: string }) {
  return (
    <p className="mt-2 border-t pt-2 text-2xs leading-relaxed text-muted-foreground">
      <span className="font-mono text-3xs tracking-eyebrow uppercase">Answers · </span>
      {children}
    </p>
  );
}

function DraftCard({
  eyebrow,
  icon,
  copyText,
  children,
  answersFinding,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  copyText: string;
  children: React.ReactNode;
  answersFinding: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
          {icon}
          {eyebrow}
        </p>
        <CopyButton text={copyText} />
      </div>
      <div className="mt-2 flex-1">{children}</div>
      <AnswersFinding>{answersFinding}</AnswersFinding>
    </div>
  );
}

export function CampaignPackage({ report }: { report: MarketingReport }) {
  const { campaign, objectionLedger, preMortem } = report;

  return (
    <div className="space-y-3">
      {/* Drafts */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {campaign.xPosts.map((post, i) => (
          <DraftCard
            key={i}
            eyebrow={`X post ${i + 1}`}
            icon={<MessageSquareText className="size-3.5" />}
            copyText={post.body}
            answersFinding={post.answersFinding}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>
          </DraftCard>
        ))}

        <DraftCard
          eyebrow={`Reddit · ${campaign.redditPost.subredditStyle}`}
          icon={<MessageSquareText className="size-3.5" />}
          copyText={`${campaign.redditPost.title}\n\n${campaign.redditPost.body}`}
          answersFinding={campaign.redditPost.answersFinding}
        >
          <p className="text-sm leading-snug font-medium">{campaign.redditPost.title}</p>
          <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground/85">
            {campaign.redditPost.body}
          </p>
        </DraftCard>

        {campaign.adVariants.map((ad, i) => (
          <DraftCard
            key={i}
            eyebrow={`Ad variant ${i + 1}`}
            icon={<Megaphone className="size-3.5" />}
            copyText={`${ad.headline}\n\n${ad.body}`}
            answersFinding={ad.answersFinding}
          >
            <p className="text-sm leading-snug font-medium">{ad.headline}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">{ad.body}</p>
          </DraftCard>
        ))}
      </div>

      {/* Objection ledger */}
      {objectionLedger.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <p className="flex items-center gap-1.5 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
            <ShieldQuestion className="size-3.5" /> Objection ledger · the honest answers
          </p>
          <ul className="mt-3 space-y-3">
            {objectionLedger.map((o) => (
              <li key={o.objection} className="grid gap-1.5 lg:grid-cols-[1fr_1.4fr] lg:gap-6">
                <div>
                  <p className="text-xs leading-snug font-medium">“{o.objection}”</p>
                  <Badge variant="outline" className="mt-1 text-3xs font-normal">
                    {o.source}
                  </Badge>
                </div>
                <p className="text-2xs leading-relaxed text-foreground/85">{o.rebuttal}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pre-mortem */}
      <div className="rounded-xl border border-destructive/30 bg-card p-5">
        <p className="flex items-center gap-1.5 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
          <Flame className="size-3.5 text-destructive" /> PR pre-mortem · the thread that could go viral
        </p>
        <p className="mt-2 text-xs leading-relaxed text-foreground/85">{preMortem.scenario}</p>
        <ul className="mt-3 space-y-2">
          {preMortem.thread.map((t, i) => (
            <li
              key={i}
              className={cn(
                "rounded-lg border bg-secondary/40 p-2.5",
                i > 0 && "ml-4 sm:ml-6",
              )}
            >
              <p className="font-mono text-3xs text-muted-foreground">{t.handle}</p>
              <p className="mt-0.5 text-xs leading-relaxed">{t.post}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t pt-3">
          <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
            Prepared response
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/85">{preMortem.responsePlan}</p>
        </div>
      </div>
    </div>
  );
}
