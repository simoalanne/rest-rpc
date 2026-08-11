import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

export type StartedServer = {
	origin: string;
	close(): Promise<void>;
};

export const listen = (server: Server): Promise<StartedServer> =>
	new Promise((resolve, reject) => {
		const onError = (error: Error) => {
			server.off("listening", onListening);
			reject(error);
		};

		const onListening = () => {
			server.off("error", onError);
			const address = server.address() as AddressInfo;

			resolve({
				origin: `http://127.0.0.1:${address.port}`,
				close: () =>
					new Promise((closeResolve, closeReject) => {
						server.close((error) =>
							error ? closeReject(error) : closeResolve(),
						);
					}),
			});
		};

		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(0, "127.0.0.1");
	});
