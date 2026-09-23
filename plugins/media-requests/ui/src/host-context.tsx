import { createContext, type ReactNode, useContext } from "react";
import type { PluginUiHost } from "reelvault-sdk/ui";

const HostContext = createContext<PluginUiHost | null>(null);

export function PluginHostProvider({ host, children }: { host: PluginUiHost; children: ReactNode }) {
	return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

export function usePluginHost(): PluginUiHost {
	const host = useContext(HostContext);
	if (!host) throw new Error("usePluginHost must be used within PluginHostProvider");
	return host;
}
