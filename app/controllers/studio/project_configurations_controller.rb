# frozen_string_literal: true

module Studio
  class ProjectConfigurationsController < BaseController
    before_action :require_studio_login
    before_action :find_project

    def show
      render json: payload
    end

    def update
      return unless can_edit?

      tracker_ids = Array(params[:tracker_ids]).map(&:to_i) & Tracker.pluck(:id)
      status_ids = Array(params[:status_ids]).map(&:to_i) & IssueStatus.pluck(:id)
      priority_ids = Array(params[:priority_ids]).map(&:to_i) & IssuePriority.pluck(:id)
      field_ids = Array(params[:custom_field_ids]).map(&:to_i) & IssueCustomField.where(is_for_all: false).pluck(:id)
      return render json: { errors: ['至少选择一个跟踪标签'] }, status: :unprocessable_entity if tracker_ids.empty?
      return render json: { errors: ['至少选择一个工单状态'] }, status: :unprocessable_entity if status_ids.empty?
      return render json: { errors: ['至少选择一个优先级'] }, status: :unprocessable_entity if priority_ids.empty?

      Project.transaction do
        @project.tracker_ids = tracker_ids
        @project.issue_custom_field_ids = field_ids
        replace_ids(ProjectIssueStatus, :issue_status_id, status_ids)
        replace_ids(ProjectIssuePriority, :issue_priority_id, priority_ids)
        if ActiveModel::Type::Boolean.new.cast(params[:workflow_custom])
          copy_workflow! if WorkflowRule.where(project_id: @project.id).none?
        else
          WorkflowRule.where(project_id: @project.id).delete_all
        end
      end
      render json: payload
    end

    def workflow
      tracker = @project.trackers.find_by(id: params[:tracker_id]) || @project.trackers.first
      role = Role.where(id: params[:role_id]).first || Role.sorted.detect(&:consider_workflow?)
      return render json: { errors: ['请先给项目选择跟踪标签'] }, status: :unprocessable_entity unless tracker && role

      statuses = enabled_statuses
      rows = WorkflowTransition.where(project_id: @project.id, tracker_id: tracker.id, role_id: role.id, author: false, assignee: false)
      render json: {
        roles: Role.sorted.select(&:consider_workflow?).map { |item| { id: item.id, name: item.name } },
        trackers: @project.trackers.map { |item| { id: item.id, name: item.name } },
        tracker_id: tracker.id,
        role_id: role.id,
        statuses: statuses.map { |item| { id: item.id, name: item.name } },
        transitions: rows.map { |row| { from: row.old_status_id, to: row.new_status_id } }
      }
    end

    def update_workflow
      return unless can_edit?

      tracker = @project.trackers.find_by(id: params[:tracker_id])
      role = Role.find_by(id: params[:role_id])
      return render json: { errors: ['跟踪标签或角色无效'] }, status: :unprocessable_entity unless tracker && role

      transitions = {}
      Array(params[:transitions]).each do |row|
        row = row.to_unsafe_h if row.respond_to?(:to_unsafe_h)
        from = (row['from'] || row[:from]).to_i
        to = (row['to'] || row[:to]).to_i
        transitions[from.to_s] ||= {}
        transitions[from.to_s][to.to_s] = { 'always' => '1' }
      end
      WorkflowTransition.replace_transitions([tracker], [role], transitions, @project.id)
      render json: { ok: true }
    end

    private

    def find_project
      @project = Project.find_by(id: params[:project_id]) || Project.find_by(identifier: params[:project_id])
      return if @project&.visible?

      render json: { errors: ['项目不存在'] }, status: :not_found
      throw :abort
    end

    def can_edit?
      return true if User.current.admin? || User.current.allowed_to?(:edit_project, @project)

      render json: { errors: ['没有维护项目配置的权限'] }, status: :forbidden
      false
    end

    def enabled_statuses
      ids = ProjectIssueStatus.where(project_id: @project.id).pluck(:issue_status_id)
      ids.any? ? IssueStatus.where(id: ids).sorted : IssueStatus.sorted
    end

    def enabled_priorities
      ids = ProjectIssuePriority.where(project_id: @project.id).pluck(:issue_priority_id)
      ids.any? ? IssuePriority.where(id: ids).order(:position) : IssuePriority.active.order(:position)
    end

    def replace_ids(model, column, ids)
      model.where(project_id: @project.id).delete_all
      ids.each { |id| model.create!(project_id: @project.id, column => id) }
    end

    def copy_workflow!
      WorkflowRule.where(project_id: nil, tracker_id: @project.tracker_ids).find_each do |rule|
        copy = rule.dup
        copy.project_id = @project.id
        copy.save!
      end
    end

    def payload
      status_ids = ProjectIssueStatus.where(project_id: @project.id).pluck(:issue_status_id)
      priority_ids = ProjectIssuePriority.where(project_id: @project.id).pluck(:issue_priority_id)
      {
        project_id: @project.id,
        trackers: Tracker.sorted.map { |tracker| { id: tracker.id, name: tracker.name, enabled: @project.tracker_ids.include?(tracker.id) } },
        statuses: IssueStatus.sorted.map { |status| { id: status.id, name: status.name, enabled: status_ids.empty? || status_ids.include?(status.id) } },
        priorities: IssuePriority.active.order(:position).map { |priority| { id: priority.id, name: priority.name, enabled: priority_ids.empty? || priority_ids.include?(priority.id) } },
        custom_fields: IssueCustomField.sorted.map { |field|
          {
            id: field.id,
            name: field.name,
            for_all: field.is_for_all?,
            enabled: field.is_for_all? || @project.issue_custom_field_ids.include?(field.id)
          }
        },
        workflow_custom: WorkflowRule.where(project_id: @project.id).exists?
      }
    end
  end
end
