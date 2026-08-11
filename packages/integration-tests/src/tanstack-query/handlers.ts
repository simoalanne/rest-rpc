import type { ImplementationShape } from "@rest-rpc/server";
import {
	type TanstackQueryContract,
	tanstackQueryContract,
} from "./contract.ts";

type Project = {
	id: string;
	name: string;
	status: "active" | "archived";
};

export type TanstackQueryHandlers = ImplementationShape<TanstackQueryContract>;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createTanstackQueryHandlers = (): TanstackQueryHandlers => {
	let version = 1;
	const projects = new Map<string, Project>(
		[
			{ id: "project-1", name: "Apollo", status: "active" as const },
			{ id: "project-2", name: "Borealis", status: "active" as const },
			{ id: "project-3", name: "Cinder", status: "archived" as const },
			{ id: "project-4", name: "Drift", status: "active" as const },
		].map((project) => [project.id, project]),
	);

	const listProjects = () => [...projects.values()];

	return {
		projects: {
			list: () => ({
				projects: listProjects(),
				version,
			}),
			get: (request) => {
				const project = projects.get(request.id);

				if (!project) {
					return {
						status: 404 as const,
						body: { code: "not_found" as const, id: request.id },
					};
				}

				return project;
			},
			search: (request) => ({
				projects: listProjects().filter((project) => {
					const matchesStatus =
						request.status === undefined || project.status === request.status;
					const matchesQuery =
						request.q === undefined ||
						project.name.toLowerCase().includes(request.q.toLowerCase());

					return matchesStatus && matchesQuery;
				}),
			}),
			create: (request) => {
				version += 1;
				const project = {
					id: `project-${projects.size + 1}`,
					name: request.name,
					status: request.status ?? "active",
				} satisfies Project;
				projects.set(project.id, project);

				return {
					status: 201 as const,
					body: {
						...project,
						tenant: request["x-test-tenant"],
					},
				};
			},
			rename: (request) => {
				if (
					listProjects().some(
						(project) =>
							project.id !== request.id && project.name === request.name,
					)
				) {
					return {
						status: 409 as const,
						body: {
							code: "name_conflict" as const,
							name: request.name,
						},
					};
				}

				const project = projects.get(request.id);
				if (!project) {
					return {
						status: 409 as const,
						body: {
							code: "name_conflict" as const,
							name: request.name,
						},
					};
				}

				version += 1;
				const renamed = { ...project, name: request.name };
				projects.set(request.id, renamed);
				return renamed;
			},
			page: (request) => {
				const start = request.cursor ? Number(request.cursor) : 0;
				const end = start + request.limit;
				const pageProjects = listProjects().slice(start, end);
				const nextCursor = end < projects.size ? String(end) : undefined;

				return {
					projects: pageProjects,
					nextCursor,
				};
			},
			slow: async (request) => {
				await delay(1_000);
				return {
					id: request.id,
					name: "Slow project",
					status: "active" as const,
				};
			},
		},
	};
};

export const createTanstackQueryImplementations = <
	TImplementationTree extends object,
>(
	router: (
		contract: TanstackQueryContract,
		handlers: TanstackQueryHandlers,
	) => TImplementationTree,
) => router(tanstackQueryContract, createTanstackQueryHandlers());
