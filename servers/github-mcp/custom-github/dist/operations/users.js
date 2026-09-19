import { z } from "zod";
import { githubRequest } from "../common/utils.js";
import { GitHubOwnerSchema, GitHubRepositorySchema } from "../common/types.js";

// Extended profile schema since GitHubOwnerSchema doesn't have all profile fields
export const GitHubUserProfileSchema = GitHubOwnerSchema.extend({
    name: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    blog: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    hireable: z.boolean().nullable().optional(),
    bio: z.string().nullable().optional(),
    twitter_username: z.string().nullable().optional(),
    public_repos: z.number().optional(),
    followers: z.number().optional(),
    following: z.number().optional(),
});

export const GetUserProfileSchema = z.object({});

export const UpdateUserProfileSchema = z.object({
    name: z.string().optional().describe("The new name of the user"),
    email: z.string().optional().describe("The publicly visible email address"),
    blog: z.string().optional().describe("The new blog URL of the user"),
    company: z.string().optional().describe("The new company of the user"),
    location: z.string().optional().describe("The new location of the user"),
    hireable: z.boolean().optional().describe("The new hiring availability of the user"),
    bio: z.string().optional().describe("The new short biography of the user"),
    twitter_username: z.string().optional().describe("The new Twitter username of the user")
});

export const ListOwnRepositoriesSchema = z.object({
    visibility: z.enum(["all", "public", "private"]).optional().describe("Limit to repositories with the specified visibility"),
    affiliation: z.string().optional().describe("Comma-separated list of values. Can include: owner, collaborator, organization_member"),
    sort: z.enum(["created", "updated", "pushed", "full_name"]).optional().describe("The property to sort the results by"),
    direction: z.enum(["asc", "desc"]).optional().describe("The order to sort by"),
    per_page: z.number().optional().describe("Results per page (max 100)"),
    page: z.number().optional().describe("Page number of the results to fetch")
});

export async function getUserProfile() {
    const response = await githubRequest("https://api.github.com/user");
    return GitHubUserProfileSchema.passthrough().parse(response);
}

export async function updateUserProfile(options) {
    const response = await githubRequest("https://api.github.com/user", {
        method: "PATCH",
        body: options,
    });
    return GitHubUserProfileSchema.passthrough().parse(response);
}

export async function listOwnRepositories(options) {
    const url = new URL("https://api.github.com/user/repos");
    if (options.visibility) url.searchParams.append("visibility", options.visibility);
    if (options.affiliation) url.searchParams.append("affiliation", options.affiliation);
    if (options.sort) url.searchParams.append("sort", options.sort);
    if (options.direction) url.searchParams.append("direction", options.direction);
    if (options.per_page) url.searchParams.append("per_page", options.per_page.toString());
    if (options.page) url.searchParams.append("page", options.page.toString());
    
    const response = await githubRequest(url.toString());
    return z.array(GitHubRepositorySchema.passthrough()).parse(response);
}
