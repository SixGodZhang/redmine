# frozen_string_literal: true

module Studio
  class IssueTemplatesController < BaseController
    before_action :require_studio_login

    def index
      project = find_visible_project
      return unless project

      templates = IssueTemplate.where(project_id: project.id).includes(:tracker, :priority).order(:name)
      render json: { templates: templates.map { |template| payload(template) } }
    end

    def create
      project = find_visible_project
      return unless project

      tracker = project.trackers.find_by(id: params[:tracker_id])
      priority = params[:priority_id].present? ? IssuePriority.find_by(id: params[:priority_id]) : nil
      errors = []
      errors << '请填写模板名称' if params[:name].to_s.strip.blank?
      errors << '请填写子单主题' if params[:subject].to_s.strip.blank?
      errors << '请选择跟踪标签' unless tracker
      errors << '优先级不存在' if params[:priority_id].present? && priority.nil?
      if errors.any?
        render json: { errors: errors }, status: :unprocessable_entity
        return
      end

      template = IssueTemplate.new(
        project: project,
        tracker: tracker,
        priority: priority,
        name: params[:name].to_s.strip,
        subject: params[:subject].to_s.strip,
        description: params[:description].to_s
      )
      if template.save
        render json: { template: payload(template) }, status: :created
      else
        render json: { errors: template.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      template = IssueTemplate.find_by(id: params[:id])
      unless template && template.project.visible?
        render json: { errors: ['模板不存在'] }, status: :not_found
        return
      end
      template.destroy
      render json: { ok: true }
    end

    private

    def find_visible_project
      project = Project.find_by(id: params[:project_id])
      unless project&.visible?
        render json: { errors: ['项目不存在'] }, status: :not_found
        return
      end
      project
    end

    def payload(template)
      {
        id: template.id,
        name: template.name,
        subject: template.subject,
        description: template.description.to_s,
        project_id: template.project_id,
        tracker_id: template.tracker_id,
        tracker_name: template.tracker&.name,
        priority_id: template.priority_id,
        priority_name: template.priority&.name
      }
    end
  end
end
