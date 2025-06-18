import * as React from "react";
import { GalleryVerticalEnd } from "lucide-react";

import { NavMain } from "@/components/nav-main";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import logo from "../logo.svg";

// This is sample data.
const data = {
	navMain: [
		{
			title: "Chat 1",
			url: "#",
			items: [
				{
					title: "Delete",
					url: "#",
				},
			],
		},
		{
			title: "Chat 2",
			url: "#",
			items: [
				{
					title: "Delete",
					url: "#",
				},
			],
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<a href="#">
								<div className=" text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
									<img src={logo} alt="logo" className="size-4" />
								</div>
								<div className="flex flex-col gap-0.5 leading-none">
									<span className="font-medium">Group 3 RAG</span>
									<span className="">v1.0.0</span>
								</div>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
			</SidebarContent>
			<SidebarFooter>
				<div className="p-1">Footer</div>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
