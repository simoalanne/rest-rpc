type VersionType = "major" | "minor" | "patch";

type Changeset = {
	commit?: string;
	releases: Array<{ name: string; type: VersionType }>;
	summary: string;
};

export default {
	getReleaseLine: (changeset: Changeset) =>
		`- ${changeset.commit?.slice(0, 7) ?? ""}: ${changeset.summary}`,
	getDependencyReleaseLine: () => "",
};
