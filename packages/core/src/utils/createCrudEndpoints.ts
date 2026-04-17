import z from "zod";
import type { Contract } from "../contracts.ts";

/**
 * Helper function to create standard CRUD endpoints for a given entity.
 * Generates an object that is compatible with the `ContractTree` definition.
 *
 * @param entity - The name of the entity (e.g., "products", "categories").
 * @param schema - The schema used for most operations unless overridden by listSchema or getByIdSchema.
 * @param createSchema - The schema used for create and update operations.
 * @param listSchema - Optional schema for the list endpoint.
 * @param getByIdSchema - Optional schema for the getById endpoint.
 * @returns An object containing the endpoint definitions for the specified CRUD operations.
 */
export const createCrudEndpoints = <
	TSchema extends z.ZodObject,
	TSchemaCreate extends z.ZodObject,
	TListSchema extends z.ZodObject = TSchema,
	TGetByIdSchema extends z.ZodObject = TSchema,
>({
	entity,
	schema,
	createSchema,
	listSchema,
	getByIdSchema,
}: {
	entity: string;
	schema: TSchema;
	createSchema: TSchemaCreate;
	listSchema?: TListSchema;
	getByIdSchema?: TGetByIdSchema;
}) => {
	const idParam = z.object({ id: z.coerce.number().int().positive() });
	const resolvedListSchema = (listSchema ?? schema) as TListSchema;
	const resolvedGetByIdSchema = (getByIdSchema ?? schema) as TGetByIdSchema;
	const basePath = `/${entity}`;
	const operations = {
		getAll: {
			path: basePath,
			method: "GET",
			response: z.array(resolvedListSchema),
		},
		getById: {
			path: `${basePath}/:id`,
			method: "GET",
			request: { params: idParam },
			response: resolvedGetByIdSchema,
		},
		create: {
			path: basePath,
			method: "POST",
			request: { body: createSchema },
			response: schema,
		},
		update: {
			path: `${basePath}/:id`,
			method: "PUT",
			request: { params: idParam, body: createSchema },
			response: schema,
		},
		delete: {
			path: `${basePath}/:id`,
			method: "DELETE",
			request: { params: idParam },
			response: schema,
		},
		getOptionsForForm: {
			path: `${basePath}/options-for-form`,
			method: "GET",
			response: z.array(z.object({ id: z.number().int(), name: z.string() })),
		},
	} as const satisfies Record<string, Contract>;
	return operations;
};
