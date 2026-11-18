"use client";
import { useState } from "react";
import { Badge, Card, Textarea } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ask } from "@/components/ui/confirm";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";

/** Living reference for the UI kit: every shared component, in the states people actually meet. */
export default function UiKit() {
  const [log, setLog] = useState<string[]>([]);
  const say = (m: string) => setLog((l) => [...l, m]);
  const [sw, setSw] = useState(false); const [ck, setCk] = useState(false);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Webbrik UI kit</h1>
      <p className="text-sm text-muted-foreground">Built on Radix primitives: focus management, keyboard behaviour and ARIA come from the primitives; the look comes from our tokens.</p>

      <Card className="space-y-3"><h2 className="text-sm font-semibold">Buttons and badges</h2>
        <div className="flex flex-wrap items-center gap-2"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="destructive">Destructive</Button>
          <Badge>Neutral</Badge><Badge tone="success">Published</Badge><Badge tone="warning">Draft</Badge><Badge tone="danger">Failed</Badge></div></Card>

      <Card className="space-y-3"><h2 className="text-sm font-semibold">Form controls</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="kit-name">Name</Label><Input id="kit-name" placeholder="Acme" /></div>
          <div className="space-y-1"><Label htmlFor="kit-plan">Plan</Label>
            <Select defaultValue="pro" onValueChange={(v) => say(`plan:${v}`)}><SelectTrigger id="kit-plan" aria-label="Plan"></SelectTrigger><SelectContent><SelectItem value="free">Free</SelectItem><SelectItem value="pro">Pro</SelectItem><SelectItem value="team">Team</SelectItem></SelectContent></Select></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="kit-notes">Notes</Label><Textarea id="kit-notes" /></div>
          <div className="flex items-center gap-2"><Switch id="kit-sw" checked={sw} onCheckedChange={setSw} /><Label htmlFor="kit-sw">Email me about deploys</Label><span className="sr-only" role="status">{sw ? "on" : "off"}</span></div>
          <div className="flex items-center gap-2"><Checkbox id="kit-ck" checked={ck} onCheckedChange={(c) => setCk(c === true)} /><Label htmlFor="kit-ck">I agree</Label></div>
        </div></Card>

      <Card className="space-y-3"><h2 className="text-sm font-semibold">Overlays</h2>
        <div className="flex flex-wrap gap-2">
          <Dialog><DialogTrigger asChild><Button variant="secondary">Open dialog</Button></DialogTrigger>
            <DialogContent title="Invite a teammate" description="They'll get an email with a link."><div className="space-y-3"><Label htmlFor="kit-invite">Email</Label><Input id="kit-invite" /><div className="flex justify-end"><DialogClose asChild><Button>Done</Button></DialogClose></div></div></DialogContent></Dialog>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary">Menu</Button></DropdownMenuTrigger>
            <DropdownMenuContent><DropdownMenuLabel>Project</DropdownMenuLabel><DropdownMenuItem onSelect={() => say("menu:rename")}>Rename</DropdownMenuItem><DropdownMenuItem onSelect={() => say("menu:duplicate")}>Duplicate</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => say("menu:delete")}>Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <Popover><PopoverTrigger asChild><Button variant="secondary">Popover</Button></PopoverTrigger><PopoverContent>Popovers hold small forms or extra detail.</PopoverContent></Popover>
          <Tooltip label="Shown on hover and keyboard focus"><Button variant="ghost">Hover me</Button></Tooltip>
          <Button variant="destructive" onClick={async () => say(`confirm:${await ask("Delete everything?", { confirmLabel: "Delete", destructive: true })}`)}>Confirm dialog</Button>
        </div></Card>

      <Card><h2 className="mb-2 text-sm font-semibold">Tabs</h2>
        <Tabs defaultValue="a"><TabsList aria-label="Example tabs"><TabsTrigger value="a">Overview</TabsTrigger><TabsTrigger value="b">Activity</TabsTrigger><TabsTrigger value="c">Settings</TabsTrigger></TabsList>
          <TabsContent value="a">Overview content</TabsContent><TabsContent value="b">Activity content</TabsContent><TabsContent value="c">Settings content</TabsContent></Tabs></Card>

      <p data-testid="kit-log" className="text-xs text-muted-foreground">{log.join(" · ")}</p>
    </main>
  );
}
