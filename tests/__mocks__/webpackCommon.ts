import { vi } from "vitest";

export const ChannelRouter = {
    transitionToChannel: vi.fn(),
};

export const NavigationRouter = {
    transitionTo: vi.fn(),
    transitionToGuild: vi.fn(),
};

export function __resetWebpackCommonMocks() {
    ChannelRouter.transitionToChannel.mockReset();
    NavigationRouter.transitionTo.mockReset();
    NavigationRouter.transitionToGuild.mockReset();
}
