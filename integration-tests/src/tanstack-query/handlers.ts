import { implement } from "@rest-rpc/fetch";
import { tanstackQueryContract } from "./contract.ts";

type Project = {
	id: string;
	name: string;
	status: "active" | "archived";
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createTanstackQueryImplementations = () => {
	const implementor = implement(tanstackQueryContract);
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
			list: implementor.projects.list.handler(() => ({
				status: 200,
				body: { projects: listProjects(), version },
			})),
			get: implementor.projects.get.handler((request) => {
				const project = projects.get(request.params.id);

				if (!project) {
					return {
						status: 404 as const,
						body: { code: "not_found" as const, id: request.params.id },
					};
				}

				return {
					status: 200 as const,
					body: project,
				};
			}),
			search: implementor.projects.search.handler((request) => ({
				status: 200,
				body: {
					projects: listProjects().filter((project) => {
						const matchesStatus =
							request.query.status === undefined ||
							project.status === request.query.status;
						const matchesQuery =
							request.query.q === undefined ||
							project.name
								.toLowerCase()
								.includes(request.query.q.toLowerCase());

						return matchesStatus && matchesQuery;
					}),
				},
			})),
			create: implementor.projects.create.handler((request) => {
				version += 1;
				const project = {
					id: `project-${projects.size + 1}`,
					name: request.body.name,
					status: request.body.status ?? "active",
				} satisfies Project;
				projects.set(project.id, project);

				return {
					status: 201 as const,
					body: {
						...project,
						tenant: request.headers["x-test-tenant"],
					},
				};
			}),
			rename: implementor.projects.rename.handler((request) => {
				if (
					listProjects().some(
						(project) =>
							project.id !== request.params.id &&
							project.name === request.body.name,
					)
				) {
					return {
						status: 409 as const,
						body: {
							code: "name_conflict" as const,
							name: request.body.name,
						},
					};
				}

				const project = projects.get(request.params.id);
				if (!project) {
					return {
						status: 409 as const,
						body: {
							code: "name_conflict" as const,
							name: request.body.name,
						},
					};
				}

				version += 1;
				const renamed = { ...project, name: request.body.name };
				projects.set(request.params.id, renamed);
				return { status: 200 as const, body: renamed };
			}),
			page: implementor.projects.page.handler((request) => {
				const start = request.query.cursor ? Number(request.query.cursor) : 0;
				const end = start + request.query.limit;
				const pageProjects = listProjects().slice(start, end);
				const nextCursor = end < projects.size ? String(end) : undefined;

				return {
					status: 200,
					body: { projects: pageProjects, nextCursor },
				};
			}),
			slow: implementor.projects.slow.handler(async (request) => {
				await delay(1_000);
				return {
					status: 200 as const,
					body: {
						id: request.params.id,
						name: "Slow project",
						status: "active" as const,
					},
				};
			}),
			events: implementor.projects.events.handler(() => ({
				status: 200,
				body: (async function* () {
					yield { id: "project-1", event: "created" as const };
					yield { id: "project-1", event: "renamed" as const };
				})(),
			})),
		},
	};
};
