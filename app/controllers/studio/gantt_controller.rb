# frozen_string_literal: true

module Studio
  class GanttController < BaseController
    include QueriesHelper

    before_action :authorize_global
    rescue_from Query::StatementInvalid, with: :query_statement_invalid

    def show
      @project = Project.visible.find_by(id: params[:gantt_project_id]) if params[:gantt_project_id].present?
      gantt = Redmine::Helpers::Gantt.new(params)
      gantt.project = @project
      retrieve_query(IssueQuery, false)
      @query.group_by = nil
      @query.add_filter('status_id', params[:status_id].presence || '*', [''])
      if params[:fixed_version_id].present?
        @query.add_filter('fixed_version_id', '=', [params[:fixed_version_id].to_s])
      end
      unless @query.valid?
        render json: { errors: @query.errors.full_messages }, status: :unprocessable_entity
        return
      end
      gantt.query = @query

      records = gantt.issues.to_a
      ActiveRecord::Associations::Preloader.new(records: records, associations: [:fixed_version, :status, :project, :tracker, :assigned_to]).call

      issues = records.map do |issue|
        version = issue.fixed_version
        {
          id: issue.id,
          subject: issue.subject,
          project_id: issue.project_id,
          project_name: issue.project.name,
          project_identifier: issue.project.identifier,
          start_date: issue.start_date,
          due_date: issue.due_date,
          done_ratio: issue.done_ratio,
          status: { id: issue.status_id, name: issue.status.name, is_closed: issue.status.is_closed? },
          tracker: issue.tracker.name,
          assigned_to: issue.assigned_to&.name,
          fixed_version_id: version&.id,
          fixed_version_name: version&.name,
          version_due: version&.effective_date
        }
      end

      version_records = @project ? @project.shared_versions.sorted.to_a : Version.visible.sorted.preload(:project).to_a
      versions = version_records.map do |version|
        {
          id: version.id,
          name: version.name,
          project_id: version.project_id,
          project_name: version.project.name,
          effective_date: version.effective_date,
          status: version.status
        }
      end

      relations = gantt.relations.flat_map do |_from_id, rels|
        rels.map { |r| { from: r.issue_from_id, to: r.issue_to_id, type: r.relation_type } }
      end

      render json: {
        date_from: gantt.date_from,
        date_to: gantt.date_to,
        year_from: gantt.year_from,
        month_from: gantt.month_from,
        months: gantt.months,
        zoom: gantt.zoom,
        issues: issues,
        versions: versions,
        relations: relations
      }
    end
  end
end
