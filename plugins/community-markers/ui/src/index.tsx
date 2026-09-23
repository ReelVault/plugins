import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { definePluginElement, mountShadow, type PluginUiHost } from "reelvault-sdk/ui";
import { CommunityMarkersAdmin } from "./admin";
import { PluginHostProvider } from "./host-context";
import { CommunityMarkersDialog } from "./markers";
import css from "./styles.css?inline";

function mount(host: PluginUiHost, element: HTMLElement, node: ReactNode): () => void {
	const root = createRoot(mountShadow(element, css));
	root.render(<PluginHostProvider host={host}>{node}</PluginHostProvider>);
	return () => root.unmount();
}

definePluginElement("rv-community-markers-dialog", (element, host) => mount(host, element, <CommunityMarkersDialog />));
definePluginElement("rv-community-markers-admin", (element, host) => mount(host, element, <CommunityMarkersAdmin />));
