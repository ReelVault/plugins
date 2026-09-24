import { definePluginElement, mountShadow, type PluginUiHost } from "@reelvault/sdk/ui";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AdminPage } from "./admin";
import { DashboardComingSoon } from "./dashboard-section";
import { DetailView } from "./detail";
import { DiscoverPage } from "./discover";
import { PluginHostProvider } from "./host-context";
import { RequestsPage } from "./requests";
import css from "./styles.css?inline";

function mount(host: PluginUiHost, element: HTMLElement, node: ReactNode): () => void {
	const root = createRoot(mountShadow(element, css));
	root.render(<PluginHostProvider host={host}>{node}</PluginHostProvider>);
	return () => root.unmount();
}

definePluginElement("rv-requests-discover", (element, host) => mount(host, element, <DiscoverPage />));
definePluginElement("rv-requests-list", (element, host) => mount(host, element, <RequestsPage />));
definePluginElement("rv-requests-admin", (element, host) => mount(host, element, <AdminPage />));
definePluginElement("rv-requests-detail", (element, host) => mount(host, element, <DetailView />));
definePluginElement("rv-requests-dashboard", (element, host) => mount(host, element, <DashboardComingSoon />));
