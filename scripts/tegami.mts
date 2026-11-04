import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tegami } from "tegami"
import { runCli } from "tegami/cli"
import { github } from "tegami/plugins/github"

const publishedPackageId = "npm:alchemy-planetscale-logical-db"

const release = tegami({
  ignore: ["alchemy-planetscale-logical-db-example", "lint"],
  npm: {
    client: "nub",
  },
  plugins: [
    github({
      repo: "jonbeckman/alchemy-planetscale-logical-db",
      release: {
        eager: false,
      },
      versionPr: {
        base: "master",
        branch: "tegami/version-packages",
      },
    }),
    {
      name: "root-version-file",
      // The built-in npm plugin applies first and writes the bumped version onto
      // the package manifest. bumpVersion() reads that manifest, so calling it
      // here increments the version a second time.
      enforce: "post",
      async applyDraft(draft) {
        const pkg = this.graph.get(publishedPackageId)

        if (!pkg?.version || !draft.getPackageDraft(pkg.id)) return
        await writeFile(join(this.cwd, "VERSION"), `${pkg.version}\n`)
      },
    },
  ],
})

await runCli(release)
