import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadSurface } from "./UploadSurface";

describe("UploadSurface", () => {
  it("presents the approved primary action", () => {
    render(<UploadSurface hintId="upload-hint" />);

    expect(
      screen.getByRole("button", { name: "Drop your video here or click to upload" }),
    ).toHaveAttribute("data-state", "idle");
    expect(screen.getByText("Drop your video here")).toBeInTheDocument();
  });

  it("makes drag intent visible and restores idle state", () => {
    render(<UploadSurface hintId="upload-hint" />);
    const surface = screen.getByRole("button", {
      name: "Drop your video here or click to upload",
    });

    fireEvent.dragEnter(surface, { dataTransfer: { files: [] } });
    expect(surface).toHaveAttribute("data-state", "drag");

    fireEvent.dragLeave(surface, { dataTransfer: { files: [] } });
    expect(surface).toHaveAttribute("data-state", "idle");
  });

  it("hands an accepted source video to the upload boundary", () => {
    const onVideoSelected = vi.fn();
    const sourceVideo = new File(["video"], "campaign.mov", { type: "video/quicktime" });
    render(<UploadSurface hintId="upload-hint" onVideoSelected={onVideoSelected} />);

    fireEvent.drop(
      screen.getByRole("button", { name: "Drop your video here or click to upload" }),
      { dataTransfer: { files: [sourceVideo] } },
    );

    expect(onVideoSelected).toHaveBeenCalledOnce();
    expect(onVideoSelected).toHaveBeenCalledWith(sourceVideo);
  });

  it("renders progress only from a real controlled upload state", () => {
    render(
      <UploadSurface
        hintId="upload-hint"
        progress={{ fileName: "campaign.mov", percent: 44, status: "Securing your source" }}
      />,
    );

    const surface = screen.getByRole("button", {
      name: "Drop your video here or click to upload",
    });
    expect(surface).toHaveAttribute("data-state", "loading");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "44");
  });

  it("keeps provider progress within the visual progress contract", () => {
    render(
      <UploadSurface
        hintId="upload-hint"
        progress={{ fileName: "campaign.mov", percent: 140, status: "Uploading source video" }}
      />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});
