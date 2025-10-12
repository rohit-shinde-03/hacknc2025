import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { createProject, updateProject, getProject } from '../../utils/projects';

export function useProjectManager(grid: boolean[][][], durationGrid: number[][][], bpm: number) {
  const router = useRouter();
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [isSaveAs, setIsSaveAs] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!currentProjectId) {
      setSaveModalName(projectName);
      setIsSaveAs(false);
      setShowSaveModal(true);
      return;
    }

    try {
      setIsSaving(true);
      await updateProject(currentProjectId, {
        name: projectName,
        grid_data: grid,
        duration_data: durationGrid,
        bpm,
        updated_at: new Date().toISOString(),
      });
      alert("Project saved successfully!");
    } catch (error) {
      console.error("Error saving project:", error);
      alert("Failed to save project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, projectName, grid, durationGrid, bpm]);

  const handleSaveAs = useCallback(() => {
    setSaveModalName(`${projectName} (Copy)`);
    setIsSaveAs(true);
    setShowSaveModal(true);
  }, [projectName]);

  const confirmSave = useCallback(async () => {
    if (!saveModalName.trim()) {
      alert("Please enter a project name");
      return;
    }

    try {
      setIsSaving(true);
      const newProject = await createProject({
        name: saveModalName,
        grid_data: grid,
        duration_data: durationGrid,
        bpm,
      });

      setCurrentProjectId(newProject.id);
      setProjectName(saveModalName);
      setShowSaveModal(false);
      setSaveModalName("");
      alert("Project saved successfully!");
    } catch (error) {
      console.error("Error saving project:", error);
      alert("Failed to save project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [saveModalName, grid, durationGrid, bpm]);

  const cancelSave = useCallback(() => {
    setShowSaveModal(false);
    setSaveModalName("");
    setIsSaveAs(false);
  }, []);

  return {
    currentProjectId,
    projectName,
    showSaveModal,
    saveModalName,
    isSaveAs,
    isSaving,
    handleSave,
    handleSaveAs,
    confirmSave,
    cancelSave,
    setSaveModalName,
    setCurrentProjectId,
    setProjectName,
  };
}

