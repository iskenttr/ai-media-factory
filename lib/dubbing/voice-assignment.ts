import { validateVoiceProfileConsent, type VoiceProfile } from "@/lib/providers/contracts/tts-provider";

export interface VoiceAssignment {
  speakerId: string;
  voiceProfileId: string;
  providerVoiceName: string;
  locale: string;
  selection: "inventory_default" | "validated_override";
}

function speakerOrder(left: string, right: string) {
  const leftNumber = Number(left.match(/^speaker_(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  const rightNumber = Number(right.match(/^speaker_(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  return leftNumber - rightNumber || left.localeCompare(right);
}

function voicePriority(profile: VoiceProfile) {
  if (profile.tags.includes("family:wavenet")) return 0;
  if (profile.tags.includes("family:standard")) return 1;
  if (profile.tags.includes("family:neural2")) return 2;
  if (profile.tags.includes("family:chirp3-hd")) return 3;
  return 4;
}

function localeMatches(profileLocale: string, targetLocale: string) {
  const normalizedProfile = profileLocale.toLowerCase();
  const normalizedTarget = targetLocale.toLowerCase();
  return normalizedProfile === normalizedTarget
    || normalizedProfile.split("-")[0] === normalizedTarget.split("-")[0];
}

export function assignVoicesToSpeakers(input: {
  speakerIds: string[];
  targetLocale: string;
  voices: VoiceProfile[];
  overrides?: Record<string, string>;
  projectId?: string;
  now?: Date;
}): VoiceAssignment[] {
  const speakers = [...new Set(input.speakerIds)].sort(speakerOrder);
  if (speakers.length === 0) throw new Error("voice_assignment_requires_speakers");
  const invalidSpeaker = speakers.find((speaker) => !/^speaker_[1-9]\d*$/.test(speaker));
  if (invalidSpeaker) throw new Error(`voice_assignment_invalid_speaker:${invalidSpeaker}`);

  const inventory = input.voices
    .filter((profile) => localeMatches(profile.locale, input.targetLocale))
    .sort((left, right) => voicePriority(left) - voicePriority(right) || left.profileId.localeCompare(right.profileId));
  if (inventory.length === 0) throw new Error(`voice_assignment_inventory_empty:${input.targetLocale}`);
  for (const profile of inventory) {
    validateVoiceProfileConsent(profile, { projectId: input.projectId, now: input.now });
  }

  const unknownOverride = Object.keys(input.overrides ?? {}).find((speaker) => !speakers.includes(speaker));
  if (unknownOverride) throw new Error(`voice_assignment_override_unknown_speaker:${unknownOverride}`);

  return speakers.map((speakerId, index) => {
    const override = input.overrides?.[speakerId];
    const profile = override
      ? inventory.find((candidate) => candidate.profileId === override)
      : inventory[index % inventory.length];
    if (!profile) throw new Error(`voice_assignment_override_not_in_inventory:${speakerId}:${override}`);
    return {
      speakerId,
      voiceProfileId: profile.profileId,
      providerVoiceName: profile.name,
      locale: profile.locale,
      selection: override ? "validated_override" as const : "inventory_default" as const,
    };
  });
}
