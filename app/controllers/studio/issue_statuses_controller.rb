# frozen_string_literal: true

module Studio
  class IssueStatusesController < BaseController
    before_action :require_admin
    before_action :find_status, only: [:update, :destroy]

    def reorder
      ids = Array(params[:ids]).map(&:to_i).uniq
      known = IssueStatus.where(id: ids).pluck(:id)
      missing = IssueStatus.where.not(id: ids).order(:position).pluck(:id)
      ordered = ids.select { |id| known.include?(id) } + missing
      IssueStatus.transaction do
        ordered.each_with_index do |id, index|
          IssueStatus.where(id: id).update_all(position: index + 1)
        end
      end
      render json: { ok: true }
    end

    def create
      status = IssueStatus.new
      status.safe_attributes = params[:issue_status]
      if status.save
        render json: { issue_status: status_json(status) }, status: :created
      else
        render json: { errors: status.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      @status.safe_attributes = params[:issue_status]
      if @status.save
        render json: { issue_status: status_json(@status) }
      else
        render json: { errors: @status.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      issue_count = Issue.where(status_id: @status.id).count
      tracker_names = Tracker.where(default_status_id: @status.id).pluck(:name)
      if issue_count.positive?
        render json: { errors: ["有 #{issue_count} 张工单正在使用「#{@status.name}」，请先改掉这些工单的状态后再删除"] }, status: :unprocessable_entity
        return
      end
      if tracker_names.any?
        render json: { errors: ["「#{@status.name}」是跟踪标签 #{tracker_names.join('、')} 的默认状态，请先更换默认状态后再删除"] }, status: :unprocessable_entity
        return
      end
      @status.destroy
      render json: { ok: true }
    end

    private

    def find_status
      @status = IssueStatus.find(params[:id])
    end

    def status_json(status)
      {
        id: status.id,
        name: status.name,
        is_closed: status.is_closed?,
        position: status.position
      }
    end
  end
end
