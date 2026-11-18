"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { Skeleton } from "@/components/Skeleton";
import { FileText, History, Image as ImageIcon, Inbox, MessageSquare, Rocket, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { AssetsTab } from "@/features/project/AssetsTab";
import { CommentsTab } from "@/features/project/CommentsTab";
import { ContentTab } from "@/features/project/ContentTab";
import { FormsTab } from "@/features/project/FormsTab";
import { PublishTab } from "@/features/project/PublishTab";
import { SettingsTab } from "@/features/project/SettingsTab";
import { VersionsTab } from "@/features/project/VersionsTab";

const TABS = { Publish: PublishTab, Content: ContentTab, Forms: FormsTab, Assets: AssetsTab, Versions: VersionsTab, Comments: CommentsTab, Settings: SettingsTab } as const;
type Tab = keyof typeof TABS;
const ICONS: Record<Tab, LucideIcon> = { Publish: Rocket, Content: FileText, Forms: Inbox, Assets: ImageIcon, Versions: History, Comments: MessageSquare, Settings };
const BLURB: Record<Tab, string> = { Publish: "Put your site online, connect a domain and manage deployments.", Content: "Collections and the items that fill your pages.", Forms: "Submissions from the forms on your site.", Assets: "Images and files used across the project.", Versions: "Saved versions you can compare and restore.", Comments: "Share a review link and read feedback.", Settings: "Webhooks, notifications and project controls." };

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Publish");
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab"); if (t && t in TABS) setTab(t as Tab); }, []);
  const [name, setName] = useState("");
  useEffect(() => { api<{ project: { name: string } }>(`/projects/${projectId}`).then((r) => setName(r.project.name)).catch((e: { status?: number }) => e.status === 401 && router.replace("/login")); }, [projectId, router]);
  const Body = TABS[tab];
  return (
    <AppFrame
      nav="projects" description={BLURB[tab]} title={name || <Skeleton className="h-8 w-60" />} width="max-w-4xl"
      crumbs={[{ href: "/dashboard", label: "Projects" }, { label: name || "Project" }]}
      actions={<Link href={`/editor/${projectId}`} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-sm)] transition-transform hover:bg-primary/90 active:translate-y-px">Open editor</Link>}
    >
      <div role="tablist" className="-mx-1 mb-6 flex gap-0.5 overflow-x-auto border-b border-border px-1" aria-label="Project sections">
        {(Object.keys(TABS) as Tab[]).map((t) => { const Icon = ICONS[t]; return (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); const u = new URL(location.href); u.searchParams.set("tab", t); history.replaceState(null, "", u); }}
            className={cn("-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring", tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4" aria-hidden />{t}
          </button>
        ); })}
      </div>
      <div role="tabpanel"><Body key={tab} id={projectId} /></div>
    </AppFrame>
  );
}
